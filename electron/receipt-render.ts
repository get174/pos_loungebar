interface Receipt {
  id: string; status: string; table_name: string; cashier_name: string;
  opened_at: string; closed_at: string | null; total: number; amount_paid: number; change_due: number;
  items: {product_name: string; quantity: number; subtotal: number}[];
}
export function renderReceipt(order: Receipt, settings: Record<string,string>) {
  const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  const money = (value: number) => escape(value.toLocaleString('fr-FR'));
  const width = settings.receipt_width==='58' ? 58 : 80;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Reçu ${escape(order.id)}</title>
  <style>@page{margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:white;color:black}body{width:${width}mm;padding:3mm;font:12px monospace;overflow-wrap:anywhere}h1{font-size:16px;margin:4px 0}p{margin:4px 0}.center{text-align:center}hr{border:0;border-top:1px dashed black;margin:8px 0}table{width:100%;border-collapse:collapse}td{padding:3px 0;vertical-align:top}td:last-child{text-align:right;white-space:nowrap;padding-left:8px}tr{break-inside:avoid}.total{font-weight:bold;font-size:14px}</style></head><body>
  <div class="center"><h1>${escape(settings.restaurant_name)}</h1><p>${escape(settings.address)}</p><p>${escape(settings.phone)}</p></div><hr>
  <p>Reçu : ${escape(order.id)}</p><p>${escape(new Date(order.closed_at || order.opened_at).toLocaleString('fr-FR'))}</p><p>Table : ${escape(order.table_name)}</p><p>Caissier : ${escape(order.cashier_name)}</p><hr>
  <table><tbody>${order.items.map(item=>`<tr><td>${escape(item.product_name)} × ${item.quantity}</td><td>${money(item.subtotal)}</td></tr>`).join('')}</tbody></table><hr>
  <p class="total">Total : ${money(order.total)} ${escape(settings.currency)}</p><p>Reçu client : ${money(order.amount_paid)}</p><p>Monnaie : ${money(order.change_due)}</p><hr><p class="center">${escape(settings.receipt_footer)}</p></body></html>`;
}
