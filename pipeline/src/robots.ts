export interface RobotsRules {
  isAllowed(url: string): boolean;
}

/**
 * Small robots.txt reader. We only honour User-agent: * / our bot
 * and Disallow rules — enough to respect the sites we crawl.
 */
export function parseRobots(contents: string): RobotsRules {
  const lines = contents.split(/\r?\n/).map((line) => line.replace(/#.*$/, "").trim());
  const disallows: string[] = [];
  let applies = false;

  for (const line of lines) {
    const match = line.match(/^(user-agent|disallow|allow)\s*:\s*(.*)$/i);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === "user-agent") {
      applies = value === "*" || /interviewprepkitbot/i.test(value);
    } else if (applies && field === "disallow" && value) {
      disallows.push(value);
    }
  }

  return {
    isAllowed(url: string) {
      try {
        const path = new URL(url).pathname;
        return !disallows.some((rule) => path.startsWith(rule));
      } catch {
        return true;
      }
    },
  };
}
