/** What the new brand dialog shows of each template; the books themselves stay on the server (lib/templates). */
export const TEMPLATE_CARDS = [
  { id: "firefox", name: "Firefox", blurb: "A product brand: a fox-and-globe mark, warm gradients on deep violet, a calm voice.", swatches: ["#ff7139", "#9059ff", "#20123a", "#f9f9fb"] },
  { id: "rust", name: "Rust", blurb: "A community brand: a strict logo, a free-to-use mascot, a heavy slab over a friendly sans.", swatches: ["#2a3439", "#a72145", "#ffc832", "#ffffff"] },
  { id: "blender", name: "Blender", blurb: "A cinematic open source brand: orange and blue on Studio Night, open movie art with credits.", swatches: ["#e87d0d", "#265787", "#1c1e22", "#ffffff"] },
] as const;
