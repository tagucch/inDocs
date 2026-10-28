(() => {
  const MOBILE = "(max-width: 640px)";
  const STYLE_ID = "indocs-mobile-style";
  const CSS = `
.indocs-table-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%}
.indocs-cards{display:grid;gap:12px;margin:12px 0}
.indocs-card{border:1px solid rgba(0,0,0,.12);border-radius:12px;padding:12px 14px;background:rgba(255,255,255,.92);font-size:14px;line-height:1.6;color:inherit}
.indocs-card-title{font-weight:700;margin-bottom:6px;overflow-wrap:anywhere}
.indocs-cell{display:grid;grid-template-columns:minmax(5em,36%) 1fr;gap:2px 10px;padding:5px 0;border-top:1px solid rgba(0,0,0,.07)}
.indocs-cell:first-of-type{border-top:0}
.indocs-k{opacity:.65;font-size:12px}
.indocs-v{min-width:0;overflow-wrap:anywhere}
table[data-indocs-folded="1"]{display:none !important}
`;
  const cards = new WeakMap();

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function isSimple(table) {
    return ![...table.querySelectorAll("td,th")].some((cell) => cell.colSpan > 1 || cell.rowSpan > 1);
  }

  function headerRow(table) {
    return table.tHead?.rows[0] ?? table.rows[0] ?? null;
  }

  function bodyRows(table) {
    const header = headerRow(table);
    return [...table.rows].filter(
      (row) => row !== header && !(table.tHead && table.tHead.contains(row)) && !(table.tFoot && table.tFoot.contains(row)),
    );
  }

  function wrapScroll(table) {
    if (table.parentElement?.classList.contains("indocs-table-scroll")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "indocs-table-scroll";
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
  }

  function fold(table) {
    const header = headerRow(table);
    if (!header || header.cells.length < 2) return;
    const headers = [...header.cells].map((cell) => cell.textContent.trim());
    const rows = bodyRows(table);
    if (!rows.length) return;
    const list = document.createElement("div");
    list.className = "indocs-cards";
    for (const row of rows) {
      const card = document.createElement("div");
      card.className = "indocs-card";
      const cells = [...row.cells];
      const first = cells[0];
      if (first && first.textContent.trim()) {
        const title = document.createElement("div");
        title.className = "indocs-card-title";
        title.innerHTML = first.innerHTML;
        card.appendChild(title);
      }
      cells.slice(1).forEach((cell, index) => {
        const line = document.createElement("div");
        line.className = "indocs-cell";
        const key = document.createElement("div");
        key.className = "indocs-k";
        key.textContent = headers[index + 1] ?? "";
        const value = document.createElement("div");
        value.className = "indocs-v";
        value.innerHTML = cell.innerHTML;
        line.append(key, value);
        card.appendChild(line);
      });
      list.appendChild(card);
    }
    table.dataset.indocsFolded = "1";
    table.parentElement.insertAdjacentElement("afterend", list);
    cards.set(table, list);
  }

  function unfold(table) {
    cards.get(table)?.remove();
    cards.delete(table);
    delete table.dataset.indocsFolded;
  }

  function overflows(table) {
    const box = table.parentElement;
    return table.scrollWidth > (box ? box.clientWidth : window.innerWidth) + 1;
  }

  function apply() {
    ensureStyle();
    const mobile = window.matchMedia(MOBILE).matches;
    for (const table of document.querySelectorAll("table")) {
      wrapScroll(table);
      if (!isSimple(table)) continue;
      if (!mobile) {
        unfold(table);
        continue;
      }
      if (table.dataset.indocsFolded) continue;
      if (overflows(table)) fold(table);
    }
  }

  let timer = 0;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(apply, 120);
  };

  apply();
  window.addEventListener("load", schedule);
  window.addEventListener("resize", schedule);
  window.matchMedia(MOBILE).addEventListener("change", schedule);
})();
