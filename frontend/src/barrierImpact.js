// Explain the mechanism, rather than repeating the visual observation. Conditional
// wording also works for findings about missing or uncertain features.
export function barrierImpact({ title, detail, impact }, profile) {
  const text = `${title} ${detail}`.toLowerCase();
  const explanations = [];
  const add = (pattern, explanation) => {
    if (pattern.test(text)) explanations.push(explanation);
  };

  add(/\b(step|steps|stair|stairs|staircase|threshold|thresholds)\b/,
    "If a step or raised edge is on your path, small wheelchair or walker wheels can catch against it, stopping forward movement or jolting the chair. Someone walking may need to lift their feet higher to avoid tripping; a level alternative can reduce that effort.");
  add(/\b(narrow|tight|clutter|obstacle|obstacles|obstructed|furniture|clearance)\b/,
    profile === "low-vision"
      ? "Objects extending into the walking path can be harder to spot with limited vision, increasing the chance of bumping into them or tripping. A clear, predictable path makes it easier to move without unexpected obstacles."
      : "When furniture or a tight turn leaves little room, a wheelchair or walker may be unable to pass or turn without backing up and repositioning. A person walking may need a detour, adding effort and time before reaching their destination.");
  add(/\b(door|doors|handle|handles)\b/,
    "If a door needs to be pulled open, you may have to hold it while moving through, which can be difficult when your hands are on wheelchair rims or a walker. An easy-to-operate door or staff assistance can reduce the reach, grip, and coordination needed.");
  add(/\b(glare|reflective|reflection|reflections|shiny)\b/,
    "Reflected light can wash out edges and lettering, making it harder to judge where a doorway, obstacle, or change in floor level begins. This can slow navigation and make a trip or collision more likely; reducing glare can make those features easier to distinguish.");
  add(/\b(sign|signs|signage|contrast|lighting|dim|dark|unlit)\b/,
    "If signs or edges are difficult to distinguish, you may miss a turn, enter the wrong area, or overlook a change in level. Clear lettering, contrasting edges, and even lighting can help you find your way with less searching or reliance on someone else.");
  add(/\b(seat|seats|seating|bench|benches|rest|standing|distance|long walk)\b/,
    "Without a reachable place to sit, you may need to keep standing or walking when you want to rest, adding fatigue or discomfort before the appointment. Seating along the way can let you pause and conserve energy.");
  add(/\b(ramp|ramps|slope|slopes|sloped|incline|inclines)\b/,
    "A ramp can provide a way past steps, but an incline can require more effort to push up and more control to slow down on the way down. Its slope, surface, and handrails determine how useful it is for you; those details need confirmation from staff.");
  add(/\b(rug|rugs|mat|mats|carpet|uneven|slippery|loose)\b/,
    "If flooring is loose, uneven, or slippery, feet or mobility-aid wheels can catch or lose traction. This can mean extra effort to move, an abrupt stop, or a loss of balance; a firm, even surface can make movement easier to control.");

  if (explanations.length) return explanations;
  if (typeof impact === "string" && impact.trim() && impact.trim() !== detail?.trim()) {
    return [impact];
  }
  return ["The photos do not establish a specific effect for this finding. Ask staff what action it would require from you—such as reaching, turning, stepping, or standing—and whether that action can be avoided for your access needs."];
}
