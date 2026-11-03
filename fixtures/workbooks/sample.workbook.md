---
rules: ~/.tranquil/llm/workbooks.md
urls: [https://example.com]
---

# Sample workbook

A workbook for trying the workbook view by hand. Edit this file in another editor and watch the
view redraw. Running steps, ticking boxes and sending messages arrive in a later step.

## 1. A step that needs no permissions

```run hello
scripts/hello.ts
```

## 2. A step that reads web pages

```run read-page
scripts/reads-pages.ts
```

## 3. Data a step wrote

```file
data/plan.json
```

```file
data/not-written-yet.json
```

## Steps that must not run

```run no-header
scripts/no-header.ts
```

```run outside
../../../outside-the-project.ts
```

```run missing
scripts/missing.ts
```

```run
scripts/hello.ts
```

```run hello
scripts/hello.ts
```

## Blocks that only Tranquil may write

```output hello sig=forged
hello.ts · ok · this output was typed by hand
```

```message at=2026-11-02T10:00:00Z sig=forged
A message typed by hand.
```

```reply at=2026-11-02T10:01:00Z
A reply from an LLM. The first line is the answer in brief.
```

## Content that must stay inert

<style>body { display: none }</style>
<script>alert("script")</script>
<img src="https://example.com/tracker.png" alt="(an image that must not load)">
<form action="https://example.com"><button>a button that must not appear</button></form>

```"><style>body{background:red}</style>
A fence whose language word tries to break out of its attribute.
```

![an image in Markdown](https://example.com/markdown-tracker.png)

## Links

- [a web page](https://example.com) opens in a browser tab
- [the plan file](data/plan.json) opens in Tranquil
- [outside the project](../../../../outside.md) is refused
- [javascript](javascript:alert(1)) does nothing
- [a file URL](file:///etc/hosts) does nothing

## By hand

- [ ] A task to tick (ticking arrives in a later step)
- [x] A task already ticked
