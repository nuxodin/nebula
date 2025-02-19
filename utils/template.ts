export async function renderTemplate(title: string, content: string, styles = "", scripts = "") {
  const baseTemplate = await Deno.readTextFile("./views/base.html");
  
  return baseTemplate
    .replace("${title}", title)
    .replace("${styles}", styles)
    .replace("${content}", content)
    .replace("${scripts}", scripts);
}

// Hilfsfunktion zum Escapen von HTML
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}