// src/public/js/main.js
/* Redup UI bootstrap */
(() => {
  console.log("🔴 Redup UI initialized");

  // Helpers
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $  = (sel, root = document) => root.querySelector(sel);
  const on = (el, type, fn, opts) => el && el.addEventListener(type, fn, opts);

  // ------------------------------------------------------------
  // 0) Tiny delight: subtle hover glow on logos or CTAs
  // ------------------------------------------------------------
  $$(".glow").forEach((node) => {
    on(node, "mouseover", () => node.classList.add("scale-105"));
    on(node, "mouseout", () => node.classList.remove("scale-105"));
  });

  // ------------------------------------------------------------
  // 1) Profile dropdown (click to open, outside/Escape to close)
  //    expects:
  //    - wrapper: [data-menu-root]
  //    - button : [data-menu-btn]
  //    - panel  : [data-menu]
  //    panel hidden by default with: opacity-0 -translate-y-1 pointer-events-none
  // ------------------------------------------------------------
  $("[data-menu-root]") &&
    $$(".relative[data-menu-root]").forEach((root) => {
      const btn  = $("[data-menu-btn]", root);
      const menu = $("[data-menu]", root);
      if (!btn || !menu) return;

      const open = () => {
        menu.classList.remove("opacity-0", "-translate-y-1", "pointer-events-none");
        btn.setAttribute("aria-expanded", "true");
      };
      const close = () => {
        menu.classList.add("opacity-0", "-translate-y-1", "pointer-events-none");
        btn.setAttribute("aria-expanded", "false");
      };

      on(btn, "click", (e) => {
        e.stopPropagation();
        const isOpen = !menu.classList.contains("opacity-0");
        isOpen ? close() : open();
      });

      on(document, "click", (e) => {
        if (!root.contains(e.target)) close();
      });

      on(document, "keydown", (e) => {
        if (e.key === "Escape") close();
      });
    });

  // ------------------------------------------------------------
  // 2) Mobile sidebar slide-in
  //    expects:
  //    - open button    : [data-open-sidebar]
  //    - sidebar element: [data-sidebar] (hidden w/ -translate-x-full on mobile)
  //    - optional close : [data-close-sidebar]
  //    - optional overlay: [data-sidebar-overlay]
  // ------------------------------------------------------------
  const sidebar     = $("[data-sidebar]");
  const openSidebar = $("[data-open-sidebar]");
  const closeSidebarBtn = $("[data-close-sidebar]");
  const overlay     = $("[data-sidebar-overlay]");

  const openSide = () => {
    if (!sidebar) return;
    sidebar.classList.remove("-translate-x-full");
    sidebar.classList.add("translate-x-0");
    overlay && overlay.classList.remove("hidden", "opacity-0", "pointer-events-none");
    document.documentElement.classList.add("overflow-hidden");
    document.body.classList.add("overflow-hidden");
  };

  const closeSide = () => {
    if (!sidebar) return;
    sidebar.classList.add("-translate-x-full");
    sidebar.classList.remove("translate-x-0");
    overlay && overlay.classList.add("opacity-0", "pointer-events-none");
    // delay hiding to allow fade-out if you animate opacity on overlay
    if (overlay) setTimeout(() => overlay.classList.add("hidden"), 150);
    document.documentElement.classList.remove("overflow-hidden");
    document.body.classList.remove("overflow-hidden");
  };

  on(openSidebar, "click", (e) => {
    e.preventDefault();
    openSide();
  });

  on(closeSidebarBtn, "click", (e) => {
    e.preventDefault();
    closeSide();
  });

  on(overlay, "click", closeSide);

  on(document, "keydown", (e) => {
    if (e.key === "Escape") closeSide();
  });

  // ------------------------------------------------------------
  // 3) Optional Login Modal
  //    expects:
  //    - trigger(s): [data-open-login]
  //    - modal root: [data-login-modal]
  //    - close btn : [data-close-login]
  //    modal hidden w/ opacity-0 pointer-events-none (and maybe "hidden")
  // ------------------------------------------------------------
  const loginModal = $("[data-login-modal]");
  const loginOpeners = $$("[data-open-login]");
  const loginClosers = $$("[data-close-login]");

  const openLogin = () => {
    if (!loginModal) return;
    loginModal.classList.remove("hidden", "opacity-0", "pointer-events-none");
    document.documentElement.classList.add("overflow-hidden");
    document.body.classList.add("overflow-hidden");
  };

  const closeLogin = () => {
    if (!loginModal) return;
    loginModal.classList.add("opacity-0", "pointer-events-none");
    // allow transition before hiding (if you use `hidden`)
    setTimeout(() => loginModal.classList.add("hidden"), 150);
    document.documentElement.classList.remove("overflow-hidden");
    document.body.classList.remove("overflow-hidden");
  };

  loginOpeners.forEach((btn) =>
    on(btn, "click", (e) => {
      e.preventDefault();
      openLogin();
    })
  );

  loginClosers.forEach((btn) =>
    on(btn, "click", (e) => {
      e.preventDefault();
      closeLogin();
    })
  );

  // click on backdrop to close (if you mark backdrop with [data-login-modal])
  on(loginModal, "click", (e) => {
    if (e.target === loginModal) closeLogin();
  });

  on(document, "keydown", (e) => {
    if (e.key === "Escape") closeLogin();
  });

  // ------------------------------------------------------------
  // 4) Toast helper (call window.showToast("Message"))
  // ------------------------------------------------------------
  window.showToast = function (msg = "", duration = 2200) {
    const el = document.createElement("div");
    el.textContent = msg;
    el.className =
      "fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2 text-xs rounded-md shadow-lg " +
      "bg-red-600 text-white opacity-0 transition-opacity duration-300 z-[60]";
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("opacity-100"));
    setTimeout(() => el.classList.remove("opacity-100"), duration);
    setTimeout(() => el.remove(), duration + 350);
  };
})();
