import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Slide {
  emoji: string;
  title: string;
  description: string;
}

const SLIDES: Slide[] = [
  {
    emoji: "👨‍🍳",
    title: "Welcome to Yes Chef!",
    description:
      "Your family's personal meal planning assistant. We'll help you plan delicious meals, build grocery lists, and simplify your week.",
  },
  {
    emoji: "📚",
    title: "Build Your Recipe Library",
    description:
      "Import recipes from any URL, search thousands online, or add your own favorites. Your collection grows with you.",
  },
  {
    emoji: "📅",
    title: "Plan Your Week",
    description:
      "Tell us what nights you cook and we'll generate a personalized meal plan based on your family's tastes and dietary needs.",
  },
  {
    emoji: "🛒",
    title: "Smart Grocery Lists",
    description:
      "One tap generates a complete shopping list from your meal plan. Check items off as you shop — it's that easy.",
  },
  {
    emoji: "👨‍👩‍👧‍👦",
    title: "Cook Together",
    description:
      "Share your kitchen with your household. Everyone sees the same meal plan, recipes, and grocery list in real time.",
  },
  {
    emoji: "🔥",
    title: "Let's Get Cooking!",
    description:
      "You're all set. Start by adding some recipes or jump straight into planning your first week of meals.",
  },
];

interface WelcomeCarouselProps {
  open: boolean;
  onComplete: () => void;
}

export default function WelcomeCarousel({ open, onComplete }: WelcomeCarouselProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const isLastSlide = currentSlide === SLIDES.length - 1;
  const isFirstSlide = currentSlide === 0;

  const goNext = useCallback(() => {
    if (isLastSlide) {
      onComplete();
    } else {
      setCurrentSlide((s) => s + 1);
    }
  }, [isLastSlide, onComplete]);

  const goBack = useCallback(() => {
    if (!isFirstSlide) {
      setCurrentSlide((s) => s - 1);
    }
  }, [isFirstSlide]);

  const slide = SLIDES[currentSlide];

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        fullScreenMobile={false}
        className="p-0 overflow-hidden max-w-sm border-0 rounded-2xl shadow-2xl [&>button:last-child]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Welcome to Yes Chef</DialogTitle>

        <div className="flex flex-col">
          {/* Hero area */}
          <div
            className="relative flex flex-col items-center justify-center px-8 pt-10 pb-6"
            style={{
              background: "linear-gradient(135deg, #EA580C 0%, #F97316 50%, #FB923C 100%)",
            }}
          >
            {/* Back arrow */}
            {!isFirstSlide && (
              <button
                onClick={goBack}
                className="absolute top-4 left-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            {/* Skip button */}
            {!isLastSlide && (
              <button
                onClick={onComplete}
                className="absolute top-4 right-4 text-white/70 hover:text-white text-sm font-medium transition-colors"
              >
                Skip
              </button>
            )}

            {/* Emoji */}
            <div className="text-6xl mb-4 animate-fade-in" key={`emoji-${currentSlide}`}>
              {slide.emoji}
            </div>

            {/* Title */}
            <h2
              className="font-display text-2xl font-bold text-white text-center animate-fade-in"
              key={`title-${currentSlide}`}
            >
              {slide.title}
            </h2>
          </div>

          {/* Body */}
          <div className="px-8 pt-5 pb-6 flex flex-col items-center">
            {/* Description */}
            <p
              className="text-stone-600 text-center text-sm leading-relaxed mb-6 min-h-[60px] animate-fade-in"
              key={`desc-${currentSlide}`}
            >
              {slide.description}
            </p>

            {/* Dot navigation */}
            <div className="flex gap-2 mb-6">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    i === currentSlide
                      ? "bg-orange-500 w-6"
                      : "bg-stone-300 hover:bg-stone-400"
                  }`}
                />
              ))}
            </div>

            {/* Next / Let's Cook button */}
            <button
              onClick={goNext}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-white transition-all"
              style={{
                background: "linear-gradient(135deg, #EA580C 0%, #F97316 100%)",
              }}
            >
              {isLastSlide ? (
                "Let's Cook!"
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
