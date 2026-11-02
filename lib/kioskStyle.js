// Kiosk home "soft cards" look (pages/index.js, components/WhatsOn.js): each section on a white card on the light
// grey page (#EEF1F5). Blue = tappable / action, green = done, red = counts and alerts only.
export const CARD = "bg-white rounded-[14px] border border-[#E7EAF0] shadow-[0_1px_2px_rgba(16,24,40,.05),0_2px_6px_rgba(16,24,40,.06)]";
export const CARD_HEAD = "flex items-center justify-between gap-2 px-[18px] py-[14px] border-b border-[#F0F2F5]";
export const CARD_TITLE = "text-base font-bold text-gray-900";
export const COUNT_PILL = "text-xs font-semibold text-red-600 bg-red-50 rounded-full px-2 py-0.5 whitespace-nowrap";
export const SECTION_LABEL = "text-[11px] font-semibold text-gray-500 uppercase tracking-wide";
// Shown on hover / keyboard focus where the screen can hover; always shown on touch-only screens
export const HOVER_ONLY = "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus:opacity-100";
// Same, but takes no room while hidden (zero-count note reactions)
export const HOVER_SHOW = "[@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover:inline-flex";
