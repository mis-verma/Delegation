import { useEffect, useState } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const PHRASES = ['Every Task', 'Every Deadline', 'One View'];
const PAUSE_TICKS = 25;
const TICK_MS = 70;

const cyclesPerPhrase = PHRASES.map(p => p.length * 2 + PAUSE_TICKS);
const cumulativeTicks = cyclesPerPhrase.reduce<number[]>(
  (acc, c) => [...acc, (acc.at(-1) ?? 0) + c], 
  []
);
const totalTicks = cumulativeTicks.at(-1) ?? 1;

export const ModernHeroTitle = () => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setStep(s => (s + 1) % totalTicks), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const phraseIdx = cumulativeTicks.findIndex(cum => step < cum);
  const remaining = step - (cumulativeTicks[phraseIdx - 1] ?? 0);
  const phrase = PHRASES[phraseIdx] || '';
  const len = phrase.length;

  const charsToShow = Math.min(remaining, len, len - Math.max(0, remaining - len - PAUSE_TICKS));
  const displayedText = phrase.substring(0, Math.max(0, charsToShow));

  return (
    <header className="flex flex-col items-center lg:items-start justify-center text-center lg:text-left px-2 py-2 sm:py-4 font-sans selection:bg-primary-500/30">

      <h1
        aria-label={PHRASES.join(", ")}
        className={cn(
          "flex items-center justify-center lg:justify-start flex-wrap gap-1",
          "text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight",
          "min-h-[2rem] sm:min-h-[2.5rem] lg:min-h-[3.25rem]",
          "animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out"
        )}
      >
        <span
          aria-hidden="true"
          className="text-text"
        >
          {displayedText}
        </span>
        
        <span
          aria-hidden="true"
          className={cn(
            "inline-block w-0.5 sm:w-1 bg-primary-500 dark:bg-primary-400 shrink-0",
            "h-6 sm:h-8 lg:h-10 ml-1 rounded-full shadow-[0_0_12px_rgba(99,102,241,0.6)]",
            "animate-[pulse_1s_steps(2,start)_infinite]"
          )}
        />
      </h1>

      <p className="max-w-md mt-3 sm:mt-4 t-meta sm:text-sm font-medium text-text-muted animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-150 fill-mode-both leading-relaxed">
        Unify your team's workflow in a single, powerful command center. 
        Track every moving piece without the administrative friction.
      </p>
      
    </header>
  );
};