console.log("🔴 Redup landing initialized");

// Subtle hover glow motion
const logo = document.querySelector(".glow");
if (logo) {
  logo.addEventListener("mouseover", () => logo.classList.add("scale-105"));
  logo.addEventListener("mouseout", () => logo.classList.remove("scale-105"));
}
