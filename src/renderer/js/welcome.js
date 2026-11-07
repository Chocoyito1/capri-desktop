// Instant, local greetings. All actual conversation still uses Capri's AI.
export const WELCOMES = {
  en: ["Hey, you. What's up?", "Hi! What's on your mind?", "There you are. What's the plan?", "Hey! Got something for me?", "Yo. I'm listening.", "Hi, hi. What are we getting into?", "Hey. Need a hand?", "Well, hello. What's happening?", "Hey! Tell me what's up.", "Hi! Let's hear it.", "Oh, hey. What are we working on?", "Hey, I'm here. Talk to me."],
  es: ['Ey, ¿qué onda?', '¡Hola! ¿Qué tenés en mente?', 'Ahí estás. ¿Cuál es el plan?', '¡Ey! ¿Qué hacemos?', 'Te escucho. ¿Qué pasó?', '¡Holii! ¿Qué se cuenta?', 'Ey, ¿necesitás una mano?', '¡Hola! ¿Cómo va todo?', 'Dale, contame.', '¡Hey! ¿En qué andamos?', 'Aquí estoy. ¿Qué necesitás?', '¡Hola, hola! Soy toda oídos.'],
};
export function welcomePicker(random = Math.random) {
  const bags = new Map();
  return language => {
    const key = WELCOMES[language] ? language : 'en';
    let bag = bags.get(key);
    if (!bag?.length) {
      bag = [...WELCOMES[key]];
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      const previous = bags.get(`${key}:last`);
      if (bag.at(-1) === previous) [bag[0], bag[bag.length - 1]] = [bag.at(-1), bag[0]];
      bags.set(key, bag);
    }
    const line = bag.pop(); bags.set(`${key}:last`, line); return line;
  };
}
