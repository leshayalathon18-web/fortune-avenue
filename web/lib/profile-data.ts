export const ACHIEVEMENTS = [
  { id: "first-deed", name: "Keys to the Avenue", description: "Finish a match while owning at least one deed." },
  { id: "auction-icon", name: "Gavel Glamour", description: "Win a live deed auction." },
  { id: "deal-maker", name: "Handshake Royalty", description: "Complete a landmark trade." },
  { id: "castle-royalty", name: "Castle Royalty", description: "Raise a castle on any landmark." },
  { id: "district-darling", name: "District Darling", description: "Complete all four landmarks sharing one D-number and symbol." },
  { id: "high-roller", name: "High Roller", description: "Finish with a fortune worth at least F3,000." },
  { id: "big-collector", name: "Vault Magnet", description: "Collect an entry fee of F150 or more." },
  { id: "avenue-champion", name: "Fortune Crowned", description: "Win a Fortune Avenue match." },
] as const;

export type AchievementId = (typeof ACHIEVEMENTS)[number]["id"];

export function achievementById(id: string) {
  return ACHIEVEMENTS.find((achievement) => achievement.id === id) ?? null;
}
