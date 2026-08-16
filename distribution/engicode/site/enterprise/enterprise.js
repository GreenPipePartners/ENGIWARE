const menuToggle = document.querySelector(".menu-toggle")
const siteMenu = document.querySelector("#site-menu")
const form = document.querySelector("[data-enterprise-form]")
const formStatus = document.querySelector("[data-form-status]")

menuToggle.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") !== "true"
  menuToggle.setAttribute("aria-expanded", String(open))
  menuToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation")
  if (open) siteMenu.dataset.open = "true"
  else delete siteMenu.dataset.open
})

for (const link of siteMenu.querySelectorAll("a")) {
  link.addEventListener("click", () => {
    menuToggle.setAttribute("aria-expanded", "false")
    menuToggle.setAttribute("aria-label", "Open navigation")
    delete siteMenu.dataset.open
  })
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return
  menuToggle.setAttribute("aria-expanded", "false")
  menuToggle.setAttribute("aria-label", "Open navigation")
  delete siteMenu.dataset.open
})

form.addEventListener("submit", (event) => {
  event.preventDefault()
  const data = new FormData(form)
  const value = (name) => String(data.get(name) ?? "").trim()
  const subjectName = (value("company") || value("full_name")).replace(/[\r\n]+/g, " ")
  const body = [
    "EngiWare enterprise inquiry",
    "",
    `Full name: ${value("full_name")}`,
    `Role: ${value("role")}`,
    `Company: ${value("company") || "Not provided"}`,
    `Company email: ${value("email")}`,
    `Phone number: ${value("phone") || "Not provided"}`,
    "",
    "Problem to solve:",
    value("message"),
  ].join("\n")

  formStatus.textContent = "Opening your email app with a prepared inquiry..."
  window.location.href = `mailto:bobby.miller@greenpipe.partners?subject=${encodeURIComponent(`EngiWare Enterprise Inquiry - ${subjectName}`)}&body=${encodeURIComponent(body)}`
})
