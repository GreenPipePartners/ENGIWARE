const menuToggle = document.querySelector(".menu-toggle")
const siteMenu = document.querySelector("#site-menu")

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
