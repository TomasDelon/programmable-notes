import { math } from 'micromark-extension-math';
import { mathFromMarkdown } from 'mdast-util-math';
import type {} from 'remark-parse';
import type { Processor } from 'unified';
import type { Construct, State } from 'micromark-util-types';
import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown';

declare module 'mdast-util-math' {
  interface InlineMathData {
    pnMathDraft?: boolean;
  }
}

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    pnMathLiteral: 'pnMathLiteral';
    pnMathLiteralData: 'pnMathLiteralData';
  }
}

const lineEnding = (code: number | null) =>
  code === -3 || code === -4 || code === -5;
const letter = (code: number | null) =>
  code !== null && ((code >= 65 && code <= 90) || (code >= 97 && code <= 122));

// Bound speculative lookahead across every math construct in one parser run.
// The weak key is micromark's fresh ParseContext, never a document/source string.
const lookaheadWork = new WeakMap<object, { remaining: number }>();
function mathLookaheadBudget(parser: object) {
  let budget = lookaheadWork.get(parser);
  if (!budget) {
    budget = { remaining: 2_000_000 };
    lookaheadWork.set(parser, budget);
  }
  return budget;
}
function chargeLookahead(budget: { remaining: number }) {
  if (--budget.remaining < 0)
    throw new Error(
      'Mathematical source analysis reached its work limit. Source remains available.',
    );
}

// End literal drafts at a possible JSX tag. Do not consume a component while
// allowing ordinary comparison signs without a tag terminator to remain text.
const jsxBoundary: Construct = {
  partial: true,
  tokenize(effects, ok, nok) {
    const allowance = mathLookaheadBudget(this.parser);
    function consume(code: number | null) {
      chargeLookahead(allowance);
      effects.consume(code);
    }
    return start;
    function start(code: number | null): State | undefined {
      if (code !== 60) return nok(code);
      effects.enter('pnMathLiteralData');
      consume(code);
      return name;
    }
    function name(code: number | null): State | undefined {
      if (code === 62) {
        effects.exit('pnMathLiteralData');
        return ok(code);
      }
      if (!letter(code) && code !== 47) return nok(code);
      consume(code);
      return tail;
    }
    function tail(code: number | null): State | undefined {
      if (code === null || lineEnding(code)) return nok(code);
      if (code === 62) {
        effects.exit('pnMathLiteralData');
        return ok(code);
      }
      consume(code);
      return tail;
    }
  },
};

const wikilinkBoundary: Construct = {
  partial: true,
  tokenize(effects, ok, nok) {
    return start;
    function start(code: number | null): State | undefined {
      if (code !== 91) return nok(code);
      effects.enter('pnMathLiteralData');
      effects.consume(code);
      return second;
    }
    function second(code: number | null): State | undefined {
      if (code !== 91) return nok(code);
      effects.exit('pnMathLiteralData');
      return ok(code);
    }
  },
};

const markdownBoundary = (code: number | null) =>
  code === 42 || code === 96 || code === 126;

const escapedMarkdown: Construct = {
  partial: true,
  tokenize(effects, ok, nok) {
    return start;
    function start(code: number | null): State | undefined {
      if (code !== 92) return nok(code);
      effects.enter('pnMathLiteralData');
      effects.consume(code);
      return next;
    }
    function next(code: number | null): State | undefined {
      if (
        code === null ||
        code === 38 ||
        !(
          (code >= 33 && code <= 47) ||
          (code >= 58 && code <= 64) ||
          (code >= 91 && code <= 96) ||
          (code >= 123 && code <= 126)
        )
      )
        return nok(code);
      effects.exit('pnMathLiteralData');
      return ok(code);
    }
  },
};

const dollarLiteral: Construct = {
  name: 'pnMathLiteral',
  tokenize(effects, ok) {
    let previous: number | null = null;
    let groupDepth = 0;
    let command = false;
    function boundary(code: number | null) {
      return (
        groupDepth === 0 &&
        (markdownBoundary(code) ||
          (code === 95 &&
            (previous === null || previous === 32 || lineEnding(previous))) ||
          (code === 91 && !command))
      );
    }
    function consume(code: number | null) {
      if (code === 123) groupDepth++;
      else if (code === 125 && groupDepth) groupDepth--;
      if (code === 92) command = true;
      else if (!letter(code) && code !== 32) command = false;
      previous = code;
      effects.consume(code);
    }
    return start;
    function start(code: number | null): State | undefined {
      effects.enter('pnMathLiteral');
      return between(code);
    }
    function end(code: number | null): State | undefined {
      effects.exit('pnMathLiteral');
      return ok(code);
    }
    function between(code: number | null): State | undefined {
      if (code === null || boundary(code)) return end(code);
      if (code === 92 && groupDepth === 0)
        return effects.check(escapedMarkdown, end, begin)(code);
      if (lineEnding(code)) {
        effects.enter('lineEnding');
        consume(code);
        effects.exit('lineEnding');
        return between;
      }
      if (code === 60) return effects.check(jsxBoundary, end, begin)(code);
      if (code === 91) return effects.check(wikilinkBoundary, end, begin)(code);
      return begin(code);
    }
    function begin(code: number | null): State | undefined {
      effects.enter('pnMathLiteralData');
      consume(code);
      return data;
    }
    function data(code: number | null): State | undefined {
      if (
        code === null ||
        boundary(code) ||
        lineEnding(code) ||
        code === 60 ||
        code === 91 ||
        code === 92
      ) {
        effects.exit('pnMathLiteralData');
        return between(code);
      }
      consume(code);
      return data;
    }
  },
};

// Raw TeX is text when it is outside a completed dollar pair. Shield command
// arguments/subscripts from MDX expression parsing; JSX/ESM constructs consume
// their own source before these Markdown-text tokenizers can run.
const texLiteral: Construct = {
  name: 'pnMathLiteral',
  tokenize(effects, ok, nok) {
    let depth = 0;
    let bracket = 0;
    let bareScript = false;
    return start;
    function start(code: number | null): State | undefined {
      effects.enter('pnMathLiteral');
      effects.enter('pnMathLiteralData');
      effects.consume(code);
      bareScript = code !== 92;
      return code === 92 ? command : script;
    }
    function command(code: number | null): State | undefined {
      if (!letter(code)) return nok(code);
      return word(code);
    }
    function word(code: number | null): State | undefined {
      if (letter(code) || code === 42) {
        effects.consume(code);
        return word;
      }
      return between(code);
    }
    function script(code: number | null): State | undefined {
      if (code === 123) return between(code);
      if (bareScript) return nok(code);
      if (code === null || lineEnding(code)) return end(code);
      effects.consume(code);
      return between;
    }
    function end(code: number | null): State | undefined {
      effects.exit('pnMathLiteralData');
      effects.exit('pnMathLiteral');
      return ok(code);
    }
    function between(code: number | null): State | undefined {
      if (code === 123) {
        depth++;
        effects.consume(code);
        return group;
      }
      if (code === 91) {
        bracket++;
        effects.consume(code);
        return group;
      }
      if (code === 32 || code === -1 || code === -2) {
        effects.consume(code);
        return between;
      }
      if (code === 95 || code === 94) {
        bareScript = false;
        effects.consume(code);
        return script;
      }
      return end(code);
    }
    function group(code: number | null): State | undefined {
      if (code === null) return end(code);
      if (code === 60)
        return effects.check(jsxBoundary, end, consumeGroup)(code);
      if (code === 92) {
        effects.consume(code);
        return escaped;
      }
      return consumeGroup(code);
    }
    function escaped(code: number | null): State | undefined {
      if (code === null) return end(code);
      effects.consume(code);
      return group;
    }
    function consumeGroup(code: number | null): State | undefined {
      if (code === 123) depth++;
      else if (code === 125 && depth) depth--;
      else if (code === 91 && !depth) bracket++;
      else if (code === 93 && bracket && !depth) bracket--;
      if (lineEnding(code)) {
        effects.exit('pnMathLiteralData');
        effects.enter('lineEnding');
      }
      effects.consume(code);
      if (lineEnding(code)) {
        effects.exit('lineEnding');
        effects.enter('pnMathLiteralData');
      }
      return depth || bracket ? group : between;
    }
  },
};

const literalFromMarkdown: FromMarkdownExtension = {
  enter: {
    pnMathLiteral(token) {
      this.enter(
        { type: 'inlineMath', value: '', data: { pnMathDraft: true } },
        token,
      );
      this.buffer();
    },
  },
  exit: {
    pnMathLiteral(token) {
      this.resume();
      const node = this.stack[this.stack.length - 1];
      if (node?.type === 'inlineMath') {
        const raw = this.sliceSerialize(token).replace(/\r\n?|\n/g, '\n');
        node.value = raw;
        node.data = {
          pnMathDraft: true,
          hName: 'span',
          hProperties: { style: 'white-space:pre-wrap' },
          hChildren: [{ type: 'text', value: raw }],
        };
      }
      this.exit(token);
    },
  },
};

/** Standard math pairs plus editable literal source for unfinished authoring. */
export function remarkMathAuthoring(this: Processor) {
  const data = this.data();
  const syntax = math();
  const flowEntry = syntax?.flow?.[36];
  const textEntry = syntax?.text?.[36];
  const flow = Array.isArray(flowEntry) ? flowEntry[0] : flowEntry;
  const text = Array.isArray(textEntry)
    ? textEntry
    : textEntry
      ? [textEntry]
      : [];
  if (!syntax || !flow)
    throw new Error('The pinned math tokenizer is unavailable.');
  // Closing-fence lookahead can otherwise repeatedly scan the same suffix for
  // unfinished fences. Charge attempts (including rolled-back checks) to one
  // parser invocation; the WeakMap never retains a document or source string.
  const closedFlow: Construct = {
    partial: true,
    tokenize(effects, ok, nok) {
      const allowance = mathLookaheadBudget(this.parser);
      function consume(code: number | null) {
        chargeLookahead(allowance);
        effects.consume(code);
      }
      let opening = 0;
      let closing = 0;
      let indent = 0;
      effects.enter('pnMathLiteral');
      return opener;
      function opener(code: number | null): State | undefined {
        if (code === 36) {
          opening++;
          consume(code);
          return opener;
        }
        if (opening < 2) return nok(code);
        return scan(code);
      }
      function scan(code: number | null): State | undefined {
        if (code === null) return nok(code);
        consume(code);
        if (lineEnding(code)) {
          indent = 0;
          return lineStart;
        }
        return scan;
      }
      function lineStart(code: number | null): State | undefined {
        if (code === 32 && indent < 3) {
          indent++;
          consume(code);
          return lineStart;
        }
        if (code === 36) {
          closing = 0;
          return fence(code);
        }
        return scan(code);
      }
      function fence(code: number | null): State | undefined {
        if (code === 36) {
          closing++;
          consume(code);
          return fence;
        }
        if (closing < opening) return scan(code);
        return tail(code);
      }
      function tail(code: number | null): State | undefined {
        if (code === null || lineEnding(code)) {
          effects.exit('pnMathLiteral');
          return ok(code);
        }
        if (code === 32 || code === -1 || code === -2) {
          consume(code);
          return tail;
        }
        return scan(code);
      }
    },
  };
  const pairedFlow: Construct = {
    ...flow,
    tokenize(effects, ok, nok) {
      return effects.check(closedFlow, effects.attempt(flow, ok, nok), nok);
    },
  };
  syntax.flow = { ...syntax.flow, 36: pairedFlow };
  syntax.text = {
    ...syntax.text,
    36: [...text, dollarLiteral],
    92: texLiteral,
    95: texLiteral,
    94: texLiteral,
  };
  (data.micromarkExtensions ??= []).push(syntax);
  (data.fromMarkdownExtensions ??= []).push(
    mathFromMarkdown(),
    literalFromMarkdown,
  );
}
