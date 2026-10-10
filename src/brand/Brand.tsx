import { platformBrand } from "./platform";
export function Brand({
  slogan = false,
  theme = "dark",
}: {
  slogan?: boolean;
  theme?: "light" | "dark";
}) {
  return (
    <span className="v-brand">
      <img
        className="v-wordmark"
        src={
          theme === "dark" ? platformBrand.logoDark : platformBrand.logoLight
        }
        alt={platformBrand.name + (slogan ? " — " + platformBrand.slogan : "")}
        width="216"
        height="98"
      />
    </span>
  );
}
