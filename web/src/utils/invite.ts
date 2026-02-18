export function buildInviteMailto(inviteCode: string): string {
  const subject = "Join me on Yes Chef! 👨‍🍳";
  const body = `Hey! I just set up our kitchen on Yes Chef — it's an AI meal planner that lets us share meal plans and grocery lists in real time.

Join our kitchen in 3 steps:
1. Go to yeschefmealplanner.com
2. Create an account
3. Enter this invite code: ${inviteCode}

See you in the kitchen!`;

  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
