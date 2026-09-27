import { motion, useReducedMotion } from "motion/react";
import { motionTiming } from "@/lib/motion";
import type { ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "li" | "section";
}

/** Fades + rises into place the first time it scrolls into view (reduced motion: appears instantly). */
export function Reveal({ children, delay = 0, y = 18, className, as = "div" }: RevealProps) {
  const Tag = motion[as];
  const reduced = useReducedMotion();
  return (
    <Tag
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{
        duration: reduced ? 0 : motionTiming.page,
        delay: reduced ? 0 : delay,
        ease: motionTiming.ease,
      }}
    >
      {children}
    </Tag>
  );
}
