#define COBJMACROS

#include <windows.h>
#include <commctrl.h>
#include <dwmapi.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <stdbool.h>
#include <wchar.h>

#include "version.h"

#define ID_STATUS 1001
#define ID_PROGRESS 1002
#define ID_TITLE 1003
#define ID_NOTE 1004

static const wchar_t *window_class = L"EngiCodeSetupWindow";
static const wchar_t *installer_url = L"https://engiware.org/install.ps1";
static HWND status_control;
static bool installing;
static HBRUSH background_brush;

static LRESULT CALLBACK window_proc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
  if (message == WM_CLOSE && installing) {
    MessageBeep(MB_ICONINFORMATION);
    return 0;
  }
  if (message == WM_DESTROY) {
    PostQuitMessage(0);
    return 0;
  }
  if (message == WM_CTLCOLORSTATIC) {
    HDC context = (HDC)wparam;
    SetBkMode(context, TRANSPARENT);
    SetTextColor(context, GetDlgCtrlID((HWND)lparam) == ID_NOTE ? RGB(149, 169, 159) : RGB(240, 255, 248));
    return (LRESULT)background_brush;
  }
  return DefWindowProcW(window, message, wparam, lparam);
}

static void pump_messages(void) {
  MSG message;
  while (PeekMessageW(&message, NULL, 0, 0, PM_REMOVE)) {
    TranslateMessage(&message);
    DispatchMessageW(&message);
  }
}

static bool create_directory_tree(const wchar_t *path) {
  wchar_t current[MAX_PATH];
  if (wcslen(path) >= MAX_PATH || wcscpy_s(current, MAX_PATH, path) != 0) return false;
  for (wchar_t *cursor = current + 3; *cursor; cursor++) {
    if (*cursor != L'\\') continue;
    *cursor = L'\0';
    CreateDirectoryW(current, NULL);
    *cursor = L'\\';
  }
  return CreateDirectoryW(current, NULL) || GetLastError() == ERROR_ALREADY_EXISTS;
}

static bool installer_paths(wchar_t *directory, wchar_t *executable, wchar_t *log_file) {
  wchar_t program_data[MAX_PATH];
  if (FAILED(SHGetFolderPathW(NULL, CSIDL_COMMON_APPDATA, NULL, SHGFP_TYPE_CURRENT, program_data))) return false;
  if (swprintf_s(directory, MAX_PATH, L"%ls\\EngiCode\\Installer", program_data) < 0) return false;
  if (swprintf_s(executable, MAX_PATH, L"%ls\\EngiCodeSetup.exe", directory) < 0) return false;
  if (swprintf_s(log_file, MAX_PATH, L"%ls\\install.log", directory) < 0) return false;
  return create_directory_tree(directory);
}

static bool persist_installer(const wchar_t *destination) {
  wchar_t source[MAX_PATH];
  if (!GetModuleFileNameW(NULL, source, MAX_PATH)) return false;
  if (_wcsicmp(source, destination) == 0) return true;
  return CopyFileW(source, destination, FALSE);
}

static bool set_resume(const wchar_t *installer) {
  HKEY key;
  const wchar_t *path = L"Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce";
  if (RegCreateKeyExW(HKEY_LOCAL_MACHINE, path, 0, NULL, 0, KEY_SET_VALUE | KEY_WOW64_64KEY, NULL, &key, NULL) != ERROR_SUCCESS) {
    return false;
  }
  wchar_t command[MAX_PATH + 32];
  swprintf_s(command, MAX_PATH + 32, L"\"%ls\" --resume", installer);
  LONG result = RegSetValueExW(key, L"EngiCodeSetup", 0, REG_SZ, (const BYTE *)command,
                               (DWORD)((wcslen(command) + 1) * sizeof(wchar_t)));
  RegCloseKey(key);
  return result == ERROR_SUCCESS;
}

static void clear_resume(void) {
  HKEY key;
  const wchar_t *path = L"Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce";
  if (RegOpenKeyExW(HKEY_LOCAL_MACHINE, path, 0, KEY_SET_VALUE | KEY_WOW64_64KEY, &key) != ERROR_SUCCESS) return;
  RegDeleteValueW(key, L"EngiCodeSetup");
  RegCloseKey(key);
}

static DWORD run_install(const wchar_t *log_file) {
  wchar_t system_directory[MAX_PATH];
  wchar_t powershell[MAX_PATH];
  wchar_t command[4096];
  if (!GetSystemDirectoryW(system_directory, MAX_PATH)) return ERROR_PATH_NOT_FOUND;
  swprintf_s(powershell, MAX_PATH, L"%ls\\WindowsPowerShell\\v1.0\\powershell.exe", system_directory);
  swprintf_s(
      command,
      4096,
      L"\"%ls\" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "
      L"\"$ErrorActionPreference='Stop';$p=Join-Path $env:TEMP 'EngiCode-install.ps1';"
      L"Invoke-WebRequest '%ls' -UseBasicParsing -OutFile $p;& $p;$c=$LASTEXITCODE;if($c){exit $c};exit 0\"",
      powershell,
      installer_url);

  SECURITY_ATTRIBUTES security = {sizeof(SECURITY_ATTRIBUTES), NULL, TRUE};
  HANDLE log = CreateFileW(log_file, GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, &security, CREATE_ALWAYS,
                           FILE_ATTRIBUTE_NORMAL, NULL);
  if (log == INVALID_HANDLE_VALUE) return GetLastError();

  STARTUPINFOW startup = {0};
  startup.cb = sizeof(startup);
  startup.dwFlags = STARTF_USESHOWWINDOW | STARTF_USESTDHANDLES;
  startup.wShowWindow = SW_HIDE;
  startup.hStdOutput = log;
  startup.hStdError = log;
  startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
  PROCESS_INFORMATION process = {0};
  installing = true;
  BOOL created = CreateProcessW(powershell, command, NULL, NULL, TRUE, CREATE_NO_WINDOW, NULL, NULL, &startup, &process);
  if (!created) {
    DWORD error = GetLastError();
    installing = false;
    CloseHandle(log);
    return error;
  }

  while (WaitForSingleObject(process.hProcess, 100) == WAIT_TIMEOUT) pump_messages();
  DWORD exit_code = ERROR_GEN_FAILURE;
  GetExitCodeProcess(process.hProcess, &exit_code);
  CloseHandle(process.hThread);
  CloseHandle(process.hProcess);
  CloseHandle(log);
  installing = false;
  return exit_code;
}

static void append_bootstrap_log(const wchar_t *log_file, DWORD exit_code) {
  HANDLE log = CreateFileW(log_file, FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_ALWAYS,
                           FILE_ATTRIBUTE_NORMAL, NULL);
  if (log == INVALID_HANDLE_VALUE) return;
  char message[128];
  int length = wsprintfA(message, "\r\n[EngiCodeSetup] PowerShell exit code: %lu\r\n", exit_code);
  DWORD written;
  WriteFile(log, message, (DWORD)length, &written, NULL);
  CloseHandle(log);
}

static bool create_start_menu_shortcut(const wchar_t *installer) {
  wchar_t programs[MAX_PATH];
  wchar_t local_app_data[MAX_PATH];
  wchar_t target[MAX_PATH];
  wchar_t shortcut[MAX_PATH];
  if (FAILED(SHGetFolderPathW(NULL, CSIDL_PROGRAMS | CSIDL_FLAG_CREATE, NULL, SHGFP_TYPE_CURRENT, programs))) return false;
  if (FAILED(SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, SHGFP_TYPE_CURRENT, local_app_data))) return false;
  swprintf_s(target, MAX_PATH, L"%ls\\EngiCode\\bin\\engicode.cmd", local_app_data);
  swprintf_s(shortcut, MAX_PATH, L"%ls\\EngiCode.lnk", programs);
  if (GetFileAttributesW(target) == INVALID_FILE_ATTRIBUTES) return false;

  IShellLinkW *link = NULL;
  if (FAILED(CoCreateInstance(&CLSID_ShellLink, NULL, CLSCTX_INPROC_SERVER, &IID_IShellLinkW, (void **)&link))) return false;
  IShellLinkW_SetPath(link, target);
  IShellLinkW_SetDescription(link, L"Launch EngiCode in Winghostty");
  IShellLinkW_SetIconLocation(link, installer, 0);
  IPersistFile *file = NULL;
  HRESULT result = IShellLinkW_QueryInterface(link, &IID_IPersistFile, (void **)&file);
  if (SUCCEEDED(result)) {
    result = IPersistFile_Save(file, shortcut, TRUE);
    IPersistFile_Release(file);
  }
  IShellLinkW_Release(link);
  return SUCCEEDED(result);
}

static HWND create_progress_window(HINSTANCE instance) {
  WNDCLASSEXW window_class_definition = {0};
  window_class_definition.cbSize = sizeof(window_class_definition);
  window_class_definition.lpfnWndProc = window_proc;
  window_class_definition.hInstance = instance;
  window_class_definition.hIcon = LoadIconW(instance, MAKEINTRESOURCEW(1));
  window_class_definition.hIconSm = window_class_definition.hIcon;
  window_class_definition.hCursor = LoadCursorW(NULL, IDC_ARROW);
  background_brush = CreateSolidBrush(RGB(7, 17, 14));
  window_class_definition.hbrBackground = background_brush;
  window_class_definition.lpszClassName = window_class;
  if (!RegisterClassExW(&window_class_definition)) return NULL;

  RECT work_area;
  SystemParametersInfoW(SPI_GETWORKAREA, 0, &work_area, 0);
  int width = 570;
  int height = 285;
  HWND window = CreateWindowExW(0, window_class, L"EngiCode Setup", WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU,
                                work_area.left + (work_area.right - work_area.left - width) / 2,
                                work_area.top + (work_area.bottom - work_area.top - height) / 2,
                                width, height, NULL, NULL, instance, NULL);
  if (!window) return NULL;
  BOOL dark_mode = TRUE;
  DwmSetWindowAttribute(window, 20, &dark_mode, sizeof(dark_mode));
  HFONT font = CreateFontW(-18, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                           CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
  HFONT title_font = CreateFontW(-28, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
                                 CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
  HWND title = CreateWindowW(L"STATIC", L"Installing EngiCode", WS_CHILD | WS_VISIBLE, 30, 28, 490, 38, window,
                             (HMENU)ID_TITLE, instance, NULL);
  SendMessageW(title, WM_SETFONT, (WPARAM)title_font, TRUE);
  status_control = CreateWindowW(L"STATIC", L"Preparing Windows, WSL2, Ubuntu, and Winghostty...",
                                 WS_CHILD | WS_VISIBLE, 32, 84, 500, 36, window, (HMENU)ID_STATUS, instance, NULL);
  SendMessageW(status_control, WM_SETFONT, (WPARAM)font, TRUE);
  HWND progress = CreateWindowW(PROGRESS_CLASSW, NULL, WS_CHILD | WS_VISIBLE | PBS_MARQUEE, 32, 136, 500, 16,
                                window, (HMENU)ID_PROGRESS, instance, NULL);
  SendMessageW(progress, PBM_SETBKCOLOR, 0, RGB(20, 40, 33));
  SendMessageW(progress, PBM_SETBARCOLOR, 0, RGB(62, 255, 164));
  SendMessageW(progress, PBM_SETMARQUEE, TRUE, 30);
  HWND note = CreateWindowW(L"STATIC", L"This can take several minutes. Do not turn off your computer.",
                            WS_CHILD | WS_VISIBLE, 32, 178, 500, 32, window, (HMENU)ID_NOTE, instance, NULL);
  SendMessageW(note, WM_SETFONT, (WPARAM)font, TRUE);
  ShowWindow(window, SW_SHOW);
  UpdateWindow(window);
  return window;
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE previous, PWSTR command_line, int show) {
  (void)previous;
  (void)show;
  bool resume = wcsstr(command_line, L"--resume") != NULL;
  if (!resume) {
    int answer = MessageBoxW(NULL,
                             L"EngiCode Setup will install WSL2, Ubuntu 24.04, Winghostty, and EngiCode.\n\n"
                             L"Windows may need to restart during setup. Continue?",
                             L"EngiCode Setup", MB_YESNO | MB_ICONINFORMATION | MB_DEFBUTTON1);
    if (answer != IDYES) return ERROR_CANCELLED;
  }

  wchar_t directory[MAX_PATH];
  wchar_t installed_executable[MAX_PATH];
  wchar_t log_file[MAX_PATH];
  if (!installer_paths(directory, installed_executable, log_file) || !persist_installer(installed_executable)) {
    MessageBoxW(NULL, L"Setup could not prepare its installation directory.", L"EngiCode Setup", MB_OK | MB_ICONERROR);
    return ERROR_CANNOT_MAKE;
  }

  INITCOMMONCONTROLSEX controls = {sizeof(INITCOMMONCONTROLSEX), ICC_PROGRESS_CLASS};
  InitCommonControlsEx(&controls);
  CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
  HWND window = create_progress_window(instance);
  if (!window) return ERROR_INVALID_WINDOW_HANDLE;
  DWORD exit_code = run_install(log_file);
  append_bootstrap_log(log_file, exit_code);

  if (exit_code == ERROR_SUCCESS) {
    clear_resume();
    create_start_menu_shortcut(installed_executable);
    DestroyWindow(window);
    int launch = MessageBoxW(NULL, L"EngiCode was installed successfully.\n\nLaunch EngiCode now?", L"EngiCode Setup",
                             MB_YESNO | MB_ICONINFORMATION | MB_DEFBUTTON1);
    if (launch == IDYES) {
      wchar_t local_app_data[MAX_PATH];
      wchar_t launcher[MAX_PATH];
      if (SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, SHGFP_TYPE_CURRENT, local_app_data))) {
        swprintf_s(launcher, MAX_PATH, L"%ls\\EngiCode\\bin\\engicode.cmd", local_app_data);
        ShellExecuteW(NULL, L"open", launcher, NULL, NULL, SW_SHOWNORMAL);
      }
    }
    CoUninitialize();
    return ERROR_SUCCESS;
  }

  if (exit_code == ERROR_SUCCESS_REBOOT_REQUIRED) {
    bool scheduled = set_resume(installed_executable);
    DestroyWindow(window);
    if (!scheduled) {
      MessageBoxW(NULL, L"Windows must restart, but Setup could not schedule automatic continuation.\n\n"
                         L"Restart Windows and run EngiCodeSetup.exe again.",
                  L"EngiCode Setup", MB_OK | MB_ICONWARNING);
      CoUninitialize();
      return exit_code;
    }
    int restart = MessageBoxW(NULL, L"Windows must restart to continue installing EngiCode.\n\nRestart now?",
                              L"EngiCode Setup", MB_YESNO | MB_ICONINFORMATION | MB_DEFBUTTON1);
    if (restart == IDYES) ShellExecuteW(NULL, L"open", L"shutdown.exe", L"/r /t 0", NULL, SW_HIDE);
    CoUninitialize();
    return exit_code;
  }

  wchar_t failure[1024];
  swprintf_s(failure, 1024, L"EngiCode installation failed with exit code %lu.\n\nReview the log at:\n%ls", exit_code, log_file);
  SetWindowTextW(status_control, L"Installation failed.");
  DestroyWindow(window);
  MessageBoxW(NULL, failure, L"EngiCode Setup", MB_OK | MB_ICONERROR);
  CoUninitialize();
  return (int)exit_code;
}
