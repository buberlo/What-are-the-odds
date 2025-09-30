export const getCookie = (name: string) => {
  if (typeof document === "undefined") return null;
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!value) return null;
  return decodeURIComponent(value.split("=").slice(1).join("="));
};
