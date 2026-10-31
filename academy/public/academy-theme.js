/* Runs before rendering, only in the standalone Academy document. No network or account storage. */
(function () {
  var choice;
  try {
    choice = localStorage.getItem("syzia.academy.theme");
  } catch (_) {}
  var theme =
    choice === "dark" || choice === "light"
      ? choice
      : window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  document.documentElement.dataset.academyTheme = theme;
})();
