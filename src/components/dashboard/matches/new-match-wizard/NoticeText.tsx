import { replayUnmask } from "@/lib/ui/replay-unmask";

/**
 * NoticeText — a notice's message with its first sentence as the lead.
 *
 * The validator's messages are written lead-first ("Frame rate too low. This
 * video runs at…"), so the strip can set that sentence `font-medium` without
 * each message arriving as two fields. The split is the first ". " — a full
 * stop followed by a space — so "29.95 fps" and "8.0 GB" stay whole. A message
 * of one sentence is all lead, which is right: it is the whole point.
 *
 * Colour is inherited: the strip decides it (`noteStripCls`, `warningStripCls`
 * or `errorStripCls`), never the text.
 *
 * The lead reads through in session replays (`replayUnmask()`): it is the
 * source's own headline ("Frame rate too low.", "Recorded at 24 fps."), which
 * may quote a measurement of the file but never a name. The rest stays masked,
 * because a video error can end in an exception's message, a value the source
 * did not write — so a message that carries one must lead with a sentence of
 * its own ("Couldn't read this video. <message>").
 */
export function NoticeText({ children }: { children: string }) {
  const cut = children.indexOf(". ");
  if (cut === -1)
    return (
      <b className="font-medium" {...replayUnmask()}>
        {children}
      </b>
    );
  return (
    <span>
      <b className="font-medium" {...replayUnmask()}>
        {children.slice(0, cut + 1)}
      </b>
      {children.slice(cut + 1)}
    </span>
  );
}
