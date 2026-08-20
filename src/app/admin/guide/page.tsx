import Link from 'next/link';
import { requirePermission } from '@/modules/admin/guard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'How to run an event' };

/**
 * The written walkthrough for organisers. Everything here is a link into the
 * screen it describes, so the guide is a route through the admin rather than a
 * page to read and then translate into clicks.
 */
export default async function AdminGuidePage() {
  await requirePermission('event:read');

  return (
    <div className="flex flex-col gap-8 lg:max-w-3xl">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl">How to run an event</h1>
        <p className="text-[15px] text-ink-muted">
          Start to finish. Each step links to the screen it describes, and nothing is visible to anyone until you
          publish at step 8.
        </p>
      </header>

      <Callout tone="info" title="Doing it again next year?">
        Do not start from scratch. Open <GuideLink href="/admin/events">Events</GuideLink>, find last year, and press{' '}
        <strong>Duplicate</strong>. That copies the programme, places, content pages, checklist, contacts and
        merchandise, moves every session to the new dates, and copies no registrations or orders. Then rejoin this
        guide at step 4.
      </Callout>

      <Step n={1} title="Create the draft" href="/admin/events" action="Events → New event">
        <p>Four things to fill in: a title, the start and end, and the timezone.</p>
        <p>
          The <strong>URL slug</strong> is the address people see —{' '}
          <code className="rounded bg-neutral-200 px-1">events.sunscript.tech/events/your-slug</code>. Leave it empty
          and it is made from the title. A title in Ukrainian or Russian is transliterated, so you always get a usable
          address.
        </p>
        <p>
          The timezone is the event&rsquo;s local time, not yours. Everything anyone sees is displayed in it, so
          getting this right now avoids re-entering the whole programme later.
        </p>
        <Note>The event is created as a draft. Nobody can see it, including people in your company.</Note>
      </Step>

      <Step n={2} title="Add the places" href="/admin/events" action="Open the event → Map">
        <p>
          Add every room, stage, restaurant and desk before the programme, because sessions attach to places. Drag each
          pin onto the floor plan; the position is what participants see on the map tab.
        </p>
        <p>
          Worth adding even when they hold no sessions: the hotel reception, the merch desk, and somewhere quiet.
          People look for those more often than for the stage.
        </p>
      </Step>

      <Step n={3} title="Build the programme" href="/admin/events" action="Open the event → Programme">
        <p>Each session needs a title, a start and end, a track, and usually a place.</p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Booking required</strong> — for anything with limited seats. Set the capacity and whether a waiting
            list is kept.
          </li>
          <li>
            <strong>Mandatory</strong> — shown to everyone as unmissable. Use it sparingly or it stops meaning
            anything.
          </li>
          <li>
            <strong>Featured</strong> — the one session highlighted on the event home screen.
          </li>
        </ul>
      </Step>

      <Step n={4} title="Write the content pages" href="/admin/events" action="Open the event → Content">
        <p>
          Travel, EventStyle, Help and the FAQ are what people read before they arrive — flights, transfers, what is
          paid for, what to wear, who to ask.
        </p>
        <p>
          Blank sections show an empty tab, which reads as broken rather than as &ldquo;nothing to say yet&rdquo;.
          Either write something or turn the section off.
        </p>
      </Step>

      <Step n={5} title="Set up the registration form" href="/admin/events" action="Open the event → Settings">
        <p>
          Ask only what changes what you do: arrival date, t-shirt size, dietary needs, whether a transfer is needed.
          Every extra question costs you completions.
        </p>
        <p>
          Set the <strong>capacity</strong> and whether a waiting list is kept. With a list, people beyond the cap are
          queued in order and moved up automatically as places free.
        </p>
      </Step>

      <Step n={6} title="Add merchandise" href="/admin/events" action="Open the event → WinStyle" optional>
        <p>
          Each item needs sizes and a stock count per size. There is no payment anywhere — people reserve, and collect
          at the merch desk.
        </p>
      </Step>

      <Step n={7} title="Check it as a participant" href="/events" action="Open the app">
        <p>
          Look at the event the way your colleagues will, on a phone. Walk the programme, the map and the registration
          form.
        </p>
        <Note>A draft is visible to you as an organiser and to nobody else, so this is safe to do before publishing.</Note>
      </Step>

      <Step n={8} title="Publish" href="/admin/events" action="Open the event → Settings → Publish">
        <p>
          Publishing makes the event visible to everyone whose email domain belongs to your company, and opens
          registration if you enabled it.
        </p>
        <Note>
          Announcements are separate. Publishing does not notify anyone — send an announcement when you want people to
          hear about it.
        </Note>
      </Step>

      <Step n={9} title="While it runs" href="/admin/checkin" action="Check-in">
        <p>
          Scan people in at the door, watch registrations, and send an announcement when something moves. A schedule
          change sent as an announcement reaches everyone who has the app open.
        </p>
      </Step>

      <Callout tone="warn" title="After it finishes">
        Leave the event published. A finished event keeps its programme, its map and its merchandise as a record —
        people can still look, and nothing can be ordered. Add the photo albums under Media once you have them.
      </Callout>
    </div>
  );
}

function Step({
  n,
  title,
  href,
  action,
  optional,
  children,
}: {
  n: number;
  title: string;
  href: string;
  action: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex gap-4">
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-pill bg-neutral-900 font-bold text-neutral-50"
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="font-display text-xl">
          {title}
          {optional ? <span className="ml-2 text-sm font-normal text-ink-muted">optional</span> : null}
        </h2>
        <GuideLink href={href}>{action}</GuideLink>
        <div className="flex flex-col gap-2 text-[15px] leading-relaxed text-ink-muted">{children}</div>
      </div>
    </section>
  );
}

function GuideLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-primary-700 underline">
      {children}
    </Link>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-neutral-200 p-3 text-sm text-ink">{children}</p>;
}

function Callout({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'warn';
  title: string;
  children: React.ReactNode;
}) {
  return (
    <aside
      className={`flex flex-col gap-2 rounded-lg p-5 ${tone === 'info' ? 'bg-primary-100' : 'bg-warning/15'}`}
    >
      <h2 className="font-display text-lg">{title}</h2>
      <p className="text-[15px] leading-relaxed text-ink">{children}</p>
    </aside>
  );
}
