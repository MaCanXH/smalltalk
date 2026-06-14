import type { TopicId } from "../../types";

/**
 * Local conversation content. Because the app is fully offline (no LLM), the
 * "AI" is driven by these topic banks: the user's simulated lines, the AI's
 * candidate replies, and reusable connective tissue (stalls / follow-ups).
 */

export interface Topic {
  id: TopicId;
  label: string;
  emoji: string;
  /** Lines used to seed the user's opening turn for this topic. */
  userOpeners: string[];
  /** Lines used for the user's later turns. */
  userFollowups: string[];
  /** AI replies, lightly themed to the topic. */
  aiReplies: string[];
  /** Topic-flavoured follow-up questions the AI can tack on. */
  aiQuestions: string[];
}

export const TOPICS: Topic[] = [
  {
    id: "weekend",
    label: "Weekend Plans",
    emoji: "🌤️",
    userOpeners: [
      "So, I'm thinking about what to do this weekend.",
      "Honestly I have no plans for the weekend yet.",
      "I might just relax this weekend, to be honest.",
    ],
    userFollowups: [
      "Maybe I'll meet some friends for brunch.",
      "I was thinking of going for a hike if the weather's nice.",
      "Probably end up bingeing a show, knowing me.",
      "I haven't decided yet, what about you?",
    ],
    aiReplies: [
      "Oh nice, a slow weekend can be exactly what you need sometimes.",
      "That sounds pretty chill. Brunch is always a solid call.",
      "A hike sounds lovely, fresh air does wonders.",
      "Totally get that, sometimes the couch just wins.",
    ],
    aiQuestions: [
      "Is there anywhere in particular you like to go?",
      "Do you usually plan ahead or just wing it?",
      "Who do you normally hang out with on weekends?",
    ],
  },
  {
    id: "work",
    label: "Work & Studies",
    emoji: "💼",
    userOpeners: [
      "Work has been kind of intense lately.",
      "I've been juggling a lot at work this week.",
      "I just wrapped up a big project, finally.",
    ],
    userFollowups: [
      "There's this deadline that's been stressing me out.",
      "My team is great though, that helps a lot.",
      "I'm trying to learn to switch off after hours.",
      "How do you handle busy periods?",
    ],
    aiReplies: [
      "Ugh, deadlines can really get to you. Glad it's behind you.",
      "Having a good team makes a huge difference, honestly.",
      "Learning to switch off is a skill in itself, props to you.",
      "That's a lot on your plate, sounds like you're handling it well.",
    ],
    aiQuestions: [
      "What kind of work do you do, if you don't mind me asking?",
      "Do you find it easy to unwind afterwards?",
      "What's the best part of the job for you?",
    ],
  },
  {
    id: "travel",
    label: "Travel",
    emoji: "✈️",
    userOpeners: [
      "I've been daydreaming about my next trip.",
      "I just got back from a short getaway, actually.",
      "I really want to travel somewhere new soon.",
    ],
    userFollowups: [
      "I'm torn between somewhere warm and somewhere cultural.",
      "The food is honestly the main reason I travel.",
      "I prefer wandering around over strict itineraries.",
      "Have you been anywhere good lately?",
    ],
    aiReplies: [
      "Oh, travel daydreams are the best kind. Where's top of the list?",
      "Welcome back! Bet you needed that reset.",
      "Same here, I plan whole trips around the food honestly.",
      "Wandering is the way, you stumble onto the best spots.",
    ],
    aiQuestions: [
      "Are you more of a beach or a city person?",
      "What's the most memorable place you've been?",
      "Do you like travelling solo or with people?",
    ],
  },
  {
    id: "food",
    label: "Food & Coffee",
    emoji: "🍜",
    userOpeners: [
      "I'm always on the hunt for a good coffee spot.",
      "I tried this new restaurant the other day.",
      "I've been getting into cooking lately, surprisingly.",
    ],
    userFollowups: [
      "The flat white there was honestly perfect.",
      "I'm a sucker for anything with a bit of spice.",
      "I'm not the best cook but I'm getting there.",
      "What's your go-to comfort food?",
    ],
    aiReplies: [
      "Oh a good flat white is a whole mood. Nice find.",
      "Spicy food fans unite, the more heat the better.",
      "Cooking is such a satisfying little win, keep at it.",
      "Now I'm hungry just hearing about it, honestly.",
    ],
    aiQuestions: [
      "Are you more of a sweet or savoury person?",
      "Do you cook much yourself or eat out a lot?",
      "What's the best thing you've eaten recently?",
    ],
  },
  {
    id: "hobbies",
    label: "Hobbies",
    emoji: "🎧",
    userOpeners: [
      "I've been trying to pick up a new hobby lately.",
      "Music has kind of taken over my free time.",
      "I started something new recently and I'm hooked.",
    ],
    userFollowups: [
      "It's harder than it looks, not gonna lie.",
      "It's a nice way to unplug from screens.",
      "I'm still pretty bad at it but it's fun.",
      "Do you have anything you're into right now?",
    ],
    aiReplies: [
      "Love that, starting something new is genuinely exciting.",
      "Anything that gets you off the screens is a win these days.",
      "Being bad at something fun is underrated, honestly.",
      "That's awesome, the hooked phase is the best part.",
    ],
    aiQuestions: [
      "What made you want to give it a try?",
      "Is it something you do alone or with others?",
      "How often do you get to do it?",
    ],
  },
  {
    id: "movies",
    label: "Shows & Movies",
    emoji: "🎬",
    userOpeners: [
      "I just finished a show and now I have a hole in my life.",
      "I can't decide what to watch next, honestly.",
      "I saw a really good film over the weekend.",
    ],
    userFollowups: [
      "The ending genuinely caught me off guard.",
      "I'm more of a slow-burn drama person.",
      "I tend to rewatch comfort shows way too much.",
      "Seen anything good lately yourself?",
    ],
    aiReplies: [
      "Oh the post-show emptiness is real, ha. What was it?",
      "A good plot twist sticks with you, I love that.",
      "Slow-burn dramas hit different when they're done right.",
      "No shame in the comfort rewatch, it's basically self-care.",
    ],
    aiQuestions: [
      "Are you into films or more of a series binger?",
      "What's a show you'd recommend to anyone?",
      "Do you like watching with people or solo?",
    ],
  },
];

export function getTopic(id: TopicId): Topic {
  return TOPICS.find((t) => t.id === id) ?? TOPICS[0];
}

/** Natural "stalling" phrases — also surfaced as coaching suggestions. */
export const STALL_PHRASES: string[] = [
  "Hmm, let me think…",
  "You know what,",
  "Well, I guess…",
  "Honestly,",
  "I mean,",
  "Oh, that reminds me —",
  "Right, so,",
  "To be fair,",
  "How do I put this…",
  "Funny you should ask,",
];

/** Richer word choices the coach nudges the user toward. */
export const WORD_UPGRADES: { plain: string; nicer: string }[] = [
  { plain: "good", nicer: "solid / lovely / spot-on" },
  { plain: "bad", nicer: "rough / underwhelming / a bit off" },
  { plain: "nice", nicer: "delightful / refreshing / charming" },
  { plain: "very tired", nicer: "wiped out / running on empty" },
  { plain: "happy", nicer: "chuffed / over the moon / buzzing" },
  { plain: "boring", nicer: "a bit of a slog / not my thing" },
  { plain: "a lot", nicer: "heaps / loads / a fair bit" },
];

/** Casual slang the scorer rewards when the user reaches for it. */
export const SLANG_MARKERS: string[] = [
  "honestly",
  "literally",
  "kinda",
  "gonna",
  "wanna",
  "no cap",
  "lowkey",
  "vibe",
  "hooked",
  "chill",
  "ages",
  "heaps",
  "spot-on",
  "wing it",
];
