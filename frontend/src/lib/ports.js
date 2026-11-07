/* The ports a shipment can go to: everything on Setup → Additional settings →
   Ship to port, with this buyer's own (Setup → Buyers) first. The list decides —
   narrowing to the buyer's ports hid a port just added to the list from every
   buyer who already had some. */
export const portsFor = (buyer, options) => {
  const all = options?.ports_ship_to || [];
  const mine = buyer?.ports || [];
  return [...all.filter((p) => mine.includes(p)), ...all.filter((p) => !mine.includes(p))];
};
