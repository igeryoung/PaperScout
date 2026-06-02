# PDF Processing (evaluate-papers)

The bash machinery for steps a and b of the pipeline in [SKILL.md](SKILL.md): download + trim, then crop one figure.

## Prereqs

One-time install: `brew install poppler qpdf`.

- **poppler** provides `pdftocairo`, `pdftotext`, `pdfinfo`.
- **qpdf** slices the PDF to its main body.

## Batch the I/O

Download and truncate (§1 and §2 below) are independent per paper and dominated by network / CPU, not reasoning. Run them in parallel for all candidates in a single Bash invocation rather than one paper at a time — e.g. a Python or shell loop that backgrounds `curl` and `qpdf` calls, then waits.

The figure crop, PDF read, and digest-writing steps must be done per paper sequentially (each consumes your context).

## §1. Download

```
curl -L --max-filesize 33554432 --max-time 60 \
  -o /tmp/paper-<safe-id>.pdf <pdfUrl>
```

- 32 MB cap (`--max-filesize 33554432`).
- On HTTP error or oversize: take the [PDF failure path](SKILL.md#pdf-failure-path).

## §2. Truncate to main body

Produce `/tmp/paper-<safe-id>-main.pdf` containing only the main paper (no References, no Appendix, no Supplementary). **All later steps — reading the PDF and rendering the figure — operate on the truncated file, never the original.**

**Strategy:** cut at the first **standalone heading line** that begins the end-matter. Primary signal is `References` / `Bibliography` (these always precede the appendix in conference papers). Fallback signal is a standalone `Appendix` / `Supplementary Material` heading. Both passes require the matching line to be **short** (≤ 60 chars) and to consist of nothing but the heading word — otherwise body sentences like "Implementation details are in Appendix C." or "Further evidence in Appendix E.1." will false-positive (this has been observed on NeurIPS/ICLR papers).

```bash
PDF=/tmp/paper-<safe-id>.pdf
PAGES=$(pdfinfo "$PDF" | awk '/^Pages:/ {print $2}')
CUTOFF=""

# Pass 1: References / Bibliography as a standalone short heading.
for p in $(seq 1 "$PAGES"); do
  if pdftotext -layout -f "$p" -l "$p" "$PDF" - 2>/dev/null \
      | awk 'length($0) <= 60 && /^[[:space:]]*(References|Bibliography)[[:space:]]*$/ {f=1; exit} END {exit !f}'; then
    CUTOFF=$((p - 1)); break
  fi
done

# Pass 2 (only if no References found): standalone Appendix-style heading.
if [ -z "$CUTOFF" ]; then
  for p in $(seq 1 "$PAGES"); do
    if pdftotext -layout -f "$p" -l "$p" "$PDF" - 2>/dev/null \
        | awk 'length($0) <= 60 && /^[[:space:]]*(Appendix|A[[:space:]]+Appendix|Supplementary[[:space:]]+Material|Supplemental[[:space:]]+Material)\b/ {f=1; exit} END {exit !f}'; then
      CUTOFF=$((p - 1)); break
    fi
  done
fi

if [ -n "$CUTOFF" ] && [ "$CUTOFF" -ge 1 ]; then
  qpdf --pages "$PDF" 1-"$CUTOFF" -- "$PDF" /tmp/paper-<safe-id>-main.pdf
else
  cp "$PDF" /tmp/paper-<safe-id>-main.pdf
fi
```

After truncation, sanity-check with `pdfinfo /tmp/paper-<safe-id>-main.pdf | grep Pages`. If implausibly small (e.g. ≤ 3 pages for a NeurIPS/ICLR paper, which are 8–10 pages), the regex hit a false positive — locate the real heading manually with `for p in $(seq 4 12); do pdftotext -layout -f $p -l $p "$PDF" - | head -3; done`.

Edge cases:

- No marker found → keep the whole PDF (rare for top-venue papers).
- Marker on page 1 → treat as no cutoff (avoid a 0-page slice).
- The `figure.pageNumber` you record later is the page index within `*-main.pdf`, which equals the original index since only the tail is dropped.

## §3. Crop one figure

**One pass — do not iterate.** A loose crop is acceptable; a missed paper is not. If the first attempt looks wrong, drop down the preference list or set `figure = null` rather than spending more passes refining a single crop.

### Preference order

Pick the **first** figure that exists in the paper:

1. **Main architecture diagram** — the figure that shows how the proposed method is structured.
2. **Highlight / teaser figure** (usually Figure 1) — the figure the authors picked to advertise the paper.
3. **Main results table or comparison figure** — the headline numbers, rendered as a figure or table image.
4. **Any other figure** that visually conveys the paper's contribution.

The candidate page comes from `*-main.pdf`, so it can never be an appendix figure.

### Record metadata

- `label` = e.g. `"Figure 1"`, `"Table 3"`.
- `pageNumber` = 1-indexed page of `*-main.pdf`.
- `caption.en` = verbatim from the paper (trim only the `"Figure N:"` prefix), ≤ 240 chars.
- `caption["zh-TW"]` = faithful Traditional Chinese translation of `caption.en`, ≤ 240 chars.

### Preview + crop (one pass)

```bash
# Preview pass — read this PNG to perceive the layout.
mkdir -p <run-dir>/figures
pdftocairo -png -singlefile -f <page> -l <page> -r 72 \
  /tmp/paper-<safe-id>-main.pdf /tmp/paper-<safe-id>-preview
sips -g pixelWidth -g pixelHeight /tmp/paper-<safe-id>-preview.png
```

Read `/tmp/paper-<safe-id>-preview.png` and estimate `(x_frac, y_frac, w_frac, h_frac)` as fractions of the preview page (each in `[0, 1]`) for the figure's bounding rectangle. The figure is the rectangle immediately above its `Figure N:` caption line. Convert to pixel coords at 150 dpi:

```
x_px = round(x_frac * preview_width_px  * 150 / 72)
y_px = round(y_frac * preview_height_px * 150 / 72)
w_px = round(w_frac * preview_width_px  * 150 / 72)
h_px = round(h_frac * preview_height_px * 150 / 72)
```

```bash
pdftocairo -png -singlefile -f <page> -l <page> -r 150 \
  -x <x_px> -y <y_px> -W <w_px> -H <h_px> \
  /tmp/paper-<safe-id>-main.pdf <run-dir>/figures/<safe-id>
```

This writes `<run-dir>/figures/<safe-id>.png` (the `.png` suffix is appended automatically).

The box should:

- Exclude page chrome (margins, column gutters, headers, footers, page numbers).
- Not extend the full page width unless the figure itself spans the full page.
- Not be the whole page.

Set `figure = { label, pageNumber, caption: { en, "zh-TW" }, renderedPath: "figures/<safe-id>.png" }`. The path is relative to the run dir (ingest resolves it).

### When to give up

If you can't confidently estimate a bounding box for the top choice:

1. Move down the preference list (architecture → highlight → main results → other).
2. If nothing in the paper crops cleanly, set `figure = null` and continue. **Never emit a full-page render as `figure`.**
3. If `pdftocairo` is missing or the render fails for an OS-level reason: `figure = null`.
