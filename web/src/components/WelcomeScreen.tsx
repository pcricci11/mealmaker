import { Button } from "@/components/ui/button";
import { buildInviteMailto } from "../utils/invite";

interface WelcomeScreenProps {
  variant: "created" | "joined";
  kitchenName: string;
  inviteCode?: string;
  creatorName?: string;
  onContinue: () => void;
}

export default function WelcomeScreen({
  variant,
  kitchenName,
  inviteCode,
  creatorName,
  onContinue,
}: WelcomeScreenProps) {
  if (variant === "created") {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <h1 className="text-2xl font-bold text-orange-600 mb-2">
          Welcome to Yes Chef! 👨‍🍳
        </h1>
        <p className="text-gray-600 mb-6 text-center max-w-md">
          Your kitchen <span className="font-semibold">{kitchenName}</span> is
          ready. Here's your invite code:
        </p>

        <div className="w-full max-w-sm rounded-lg border border-gray-200 p-6 space-y-4">
          {/* Big copyable invite code */}
          <div className="flex items-center justify-center rounded-md bg-orange-50 px-4 py-3">
            <span className="font-mono text-3xl font-bold text-orange-700 select-all">
              {inviteCode}
            </span>
          </div>

          <p className="text-sm text-gray-500 text-center">
            Share this code with your household members so they can join your
            kitchen and start planning meals together.
          </p>

          <div className="space-y-2">
            <Button
              asChild
              className="w-full bg-orange-600 hover:bg-orange-700"
            >
              <a href={buildInviteMailto(inviteCode ?? "")}>
                Invite Someone Now
              </a>
            </Button>
            <Button
              onClick={onContinue}
              variant="ghost"
              className="w-full text-gray-500"
            >
              Skip for Now → Let's Plan
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // "joined" variant
  const subtitle = creatorName ? (
    <>
      <span className="font-semibold">{creatorName}</span> invited you to{" "}
      <span className="font-semibold">{kitchenName}</span>.
    </>
  ) : (
    <>
      You've joined <span className="font-semibold">{kitchenName}</span>.
    </>
  );

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <h1 className="text-2xl font-bold text-orange-600 mb-2">
        Welcome to Yes Chef! 👨‍🍳
      </h1>
      <p className="text-gray-600 mb-6 text-center max-w-md">{subtitle}</p>

      <div className="w-full max-w-sm rounded-lg border border-gray-200 p-6 space-y-4">
        <p className="text-sm text-gray-500 text-center">
          You now share the same meal plans, recipes, and grocery lists. When
          anyone in your kitchen plans a meal or checks off a grocery item,
          everyone sees it in real time.
        </p>

        <Button
          onClick={onContinue}
          className="w-full bg-orange-600 hover:bg-orange-700"
        >
          Start Cooking →
        </Button>
      </div>
    </div>
  );
}
