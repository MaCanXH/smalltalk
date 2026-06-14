import type { DialogTurn, TopicId } from "../../types";
import { getTopic, STALL_PHRASES, type Topic } from "./banks";

/**
 * Offline "AI" dialog engine.
 *
 * It has no model behind it — instead it keeps light conversation state and
 * mixes topic banks, keyword reactions, stalling phrases and follow-up
 * questions so the back-and-forth feels responsive rather than canned.
 */

function pick<T>(arr: T[], avoid: Set<string> = new Set()): T {
  const fresh = arr.filter((x) => !avoid.has(String(x)));
  const pool = fresh.length > 0 ? fresh : arr;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Light keyword reactions so the AI seems to "hear" the user. */
const KEYWORD_REACTIONS: { match: RegExp; reply: string }[] = [
  { match: /\b(tired|exhausted|wiped|stressed|busy)\b/i, reply: "Oof, sounds like you could use a proper break." },
  { match: /\b(excited|can't wait|stoked|hyped)\b/i, reply: "Love that energy, your excitement is contagious." },
  { match: /\b(nervous|worried|anxious)\b/i, reply: "That's totally fair, those nerves are pretty normal." },
  { match: /\b(food|eat|coffee|brunch|dinner)\b/i, reply: "Okay now you're speaking my language, I'm always down to talk food." },
  { match: /\b(weather|rain|sunny|hot|cold)\b/i, reply: "The weather really does set the whole tone of a day, doesn't it." },
  { match: /\?$/, reply: "" }, // handled by question logic below
];

export class DialogEngine {
  readonly topic: Topic;
  private usedAi = new Set<string>();
  private usedUser = new Set<string>();
  private aiTurns = 0;

  constructor(topicId: TopicId) {
    this.topic = getTopic(topicId);
  }

  /** Produce the user's simulated spoken line for this turn. */
  nextUserLine(turnIndex: number): string {
    const bank = turnIndex === 0 ? this.topic.userOpeners : this.topic.userFollowups;
    const line = pick(bank, this.usedUser);
    this.usedUser.add(line);
    return line;
  }

  /** Produce the AI's reply to a user line. */
  replyTo(userLine: string): string {
    this.aiTurns += 1;
    const parts: string[] = [];

    // ~40% of the time, lead with a natural stall so it sounds human.
    if (Math.random() < 0.4) {
      parts.push(pick(STALL_PHRASES));
    }

    // React to keywords if any fire; otherwise use a topic reply.
    const reaction = KEYWORD_REACTIONS.find(
      (k) => k.reply && k.match.test(userLine)
    );
    if (reaction && Math.random() < 0.7) {
      parts.push(reaction.reply);
    } else {
      const reply = pick(this.topic.aiReplies, this.usedAi);
      this.usedAi.add(reply);
      parts.push(reply);
    }

    // If the user asked a question, make sure we volley one back to keep it going.
    const userAsked = /\?$/.test(userLine.trim());
    if (userAsked || Math.random() < 0.55) {
      parts.push(pick(this.topic.aiQuestions, this.usedAi));
    }

    return joinNaturally(parts);
  }

  /** A short, warm opener the AI says before the user starts the topic. */
  greeting(): string {
    return pick([
      "Hey! Great to see you. Whenever you're ready, just start talking — I'm all ears.",
      "Hi there! Let's just chat like normal. Kick us off whenever you like.",
      "Hey, good to have you. Take the lead and I'll follow — what's on your mind?",
    ]);
  }
}

function joinNaturally(parts: string[]): string {
  const cleaned = parts.map((p) => p.trim()).filter(Boolean);
  let out = "";
  for (const part of cleaned) {
    if (!out) {
      out = part;
      continue;
    }
    // If the previous chunk ended with a comma/dash, lowercase the join.
    if (/[,—]$/.test(out)) {
      out += " " + part.charAt(0).toLowerCase() + part.slice(1);
    } else {
      out += " " + part;
    }
  }
  return out;
}

/** Convenience: build a fresh turn record. */
export function makeTurn(
  speaker: DialogTurn["speaker"],
  text: string,
  t: number
): DialogTurn {
  return { speaker, text, t };
}
