import { Fragment, useEffect, useState } from "react";

/** Keeps the real text in the layout while the cipher overlays each letter. */
export function ScrambleText({ text }: { text: string }) {
  const [cipher, setCipher] = useState<string[] | null>(null);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const letters = Array.from(text);
    const started = performance.now();
    let timer: ReturnType<typeof setInterval> | undefined;

    const stop = () => {
      if (timer !== undefined) clearInterval(timer);
      setCipher(null);
    };
    const update = () => {
      const progress = Math.min(1, (performance.now() - started) / 900);
      if (preference.matches || progress >= 1) {
        stop();
        return;
      }
      setCipher(letters.map((letter, index) => {
        if (/\s/u.test(letter) || index / letters.length < progress) return letter;
        const alphabet = letter === letter.toUpperCase() ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "abcdefghijklmnopqrstuvwxyz";
        return alphabet[Math.floor(Math.random() * alphabet.length)];
      }));
    };

    if (!preference.matches) {
      timer = setInterval(update, 70);
      update();
    }
    preference.addEventListener("change", stop);
    return () => {
      if (timer !== undefined) clearInterval(timer);
      preference.removeEventListener("change", stop);
    };
  }, [text]);

  let offset = 0;
  return (
    <span className="animated-text scramble-text">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.split(/(\s+)/u).map((word, wordIndex) => {
          const start = offset;
          offset += Array.from(word).length;
          if (/^\s+$/u.test(word)) return <Fragment key={wordIndex}>{word}</Fragment>;
          return (
            <span className="animated-word" key={wordIndex}>
              {Array.from(word).map((letter, index) => {
                const displayed = cipher?.[start + index] ?? letter;
                const scrambled = displayed !== letter;
                return (
                  <span className={`scramble-letter${scrambled ? " is-scrambling" : ""}`} key={index}>
                    <span className="scramble-original">{letter}</span>
                    {scrambled && <span className="scramble-cipher">{displayed}</span>}
                  </span>
                );
              })}
            </span>
          );
        })}
      </span>
    </span>
  );
}

/** One gentle power-on: no looping, pointer interference, or dark letters. */
export function NeonText({ text, active }: { text: string; active: boolean }) {
  const [lit, setLit] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    setLit(active && !preference.matches);
    const stop = () => setLit(false);
    preference.addEventListener("change", stop);
    return () => preference.removeEventListener("change", stop);
  }, [active]);

  return <span className={`animated-text neon-text${lit ? " neon-ignite" : ""}`}>{text}</span>;
}