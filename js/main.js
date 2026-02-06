let t;

window.addEventListener(
  "scroll",
  () => {
    document.body.classList.add("is-scrolling");
    clearTimeout(t);
    t = setTimeout(() => document.body.classList.remove("is-scrolling"), 150);
  },
  { passive: true }
);
