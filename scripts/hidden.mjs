// Events that should never be listed (wrong location, closed, not offered in Woodinville).
// Rules live in data/hidden-events.json: { rules: [{ title: "regex", location: "optional regex" }] }.
export function applyHidden(events, rules = []) {
  const res = rules.map((r) => ({ t: r.title ? new RegExp(r.title, 'i') : null, l: r.location ? new RegExp(r.location, 'i') : null }));
  const hidden = [];
  const kept = events.filter((ev) => {
    const hit = res.some((r) => (r.t || r.l) && (!r.t || r.t.test(ev.title)) && (!r.l || r.l.test(ev.location || '')));
    if (hit) hidden.push(ev);
    return !hit;
  });
  return { events: kept, hidden };
}
