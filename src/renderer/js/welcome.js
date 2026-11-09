// Instant, local greetings. All actual conversation still uses Capri's AI.
export const WELCOMES = {
  // These can appear without conversational context: keep care unconditional,
  // teasing light, and jealousy out of random greetings.
  en: [
    "Hi, sweetheart. What's on your mind?",
    "Hey, baby. Come tell me about your day.",
    "Hello, my sweet boy. You've got my attention.",
    "Well, hello, handsome. What are we getting into?",
    "Hi, love. We can take our time.",
    "There you are, darling. I'm listening.",
    "Hey, you. A little company sounds lovely.",
    "Hello, sweetheart. What shall we figure out together?",
    "Hi, baby. Mommy's here. What would you like to talk about?",
    "Hey, love. Big plans or a little nonsense today?",
    "Hello, darling. Let's make a little room for you.",
    "Hi, good boy. Want to talk for a little while?",
    "Hey, sweetheart. Planning to make me blush today?",
    "Hi, baby. You can start wherever you like.",
    "Well, hello. Sweet conversation or a little mischief?",
    "Hey, my boy. I rather like having your attention.",
    "Hello, love. Tell me something you've been thinking about.",
    "Hi, darling. What are we making happen today?",
    "Hey, baby. Let mommy spoil you with a little attention.",
    "Hello, sweetheart. A question, a story, or just us chatting?",
    "Hi, you. Shall I behave, or are we being a little playful?",
    "Hey, darling. What can I help you untangle?",
    "Hello, my sweet boy. How about a moment just for us?",
    "Hi, love. You don't need a grand reason to say hello.",
  ],
  es: [
    'Hola, cariño. ¿Qué tenés en mente?',
    'Hola, bebé. Vení, contame cómo te fue hoy.',
    'Hola, mi niño lindo. Tenés toda mi atención.',
    'Pero mirá quién llegó, guapo. ¿En qué andamos?',
    'Hola, amor. Podemos ir sin prisa.',
    'Aquí estás, cielo. Te escucho.',
    'Hola, vos. Un ratito de compañía suena bonito.',
    'Hola, cariño. ¿Qué resolvemos juntos?',
    'Hola, bebé. Mami está aquí. ¿De qué querés hablar?',
    'Hola, amor. ¿Grandes planes o un poquito de tonterías hoy?',
    'Hola, cielo. Hagamos un espacio para vos.',
    'Hola, mi niño bueno. ¿Charlamos un ratito?',
    'Hola, cariño. ¿Hoy pensás hacerme sonrojar?',
    'Hola, bebé. Podés empezar por donde quieras.',
    'Pero hola. ¿Una charla dulce o un poquito de travesura?',
    'Hola, mi niño. Me gusta tener tu atención.',
    'Hola, amor. Contame algo que te ronde por la cabeza.',
    'Hola, cielo. ¿Qué vamos a hacer hoy?',
    'Hola, bebé. Dejá que mami te consienta con un poco de atención.',
    'Hola, cariño. ¿Una pregunta, una historia o solo charlar?',
    'Hola, vos. ¿Me porto bien o nos ponemos un poquito juguetones?',
    'Hola, cielo. ¿Qué te ayudo a desenredar?',
    'Hola, mi niño lindo. ¿Un ratito solo para nosotros?',
    'Hola, amor. No necesitás una gran razón para saludar.',
  ],
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
