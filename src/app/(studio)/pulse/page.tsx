import {
  Donut,
  Figure,
  Funnel,
  LineChart,
  PairedBars,
  QuoteCard,
  Section,
  SplitBar,
  StackedColumns,
  ThemeBars,
  Tile,
} from "@/components/pulse/charts";
import { behaviour } from "@/lib/pulse/behaviour";
import { growthSample as growth } from "@/lib/pulse/sample";
import { voiceSample as voice } from "@/lib/pulse/voice-sample";

/**
 * Weekly Pulse: how acquisition did this week.
 *
 * One page, three sections, each a read and then its pictures.
 */
export default function PulsePage() {
  const quotes = voice.themes.flatMap((theme) =>
    theme.quotes.slice(0, 1).map((quote) => ({ ...quote, theme: theme.name })),
  );

  return (
    <div className="mx-auto w-full max-w-[68rem] px-5 pb-16 pt-2 sm:px-8">
      <div className="mb-10 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-md font-medium tracking-[var(--tracking-tight)]">Weekly Pulse</h1>
        <span className="text-ui text-foreground-muted">{behaviour.week}</span>
      </div>

      <Section title="Growth" read={growth.read} sample>
        <Tile title="Are we growing efficiently?">
          <div className="grid gap-8 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-12">
            <Figure value={growth.value} unit={growth.unit} note={growth.note} />
            <LineChart values={growth.values} labels={growth.labels} />
          </div>
        </Tile>
      </Section>

      <Section title="On the site" read={behaviour.read} source="Mixpanel">
        <Tile title="From the first page to a purchase">
          <Funnel steps={behaviour.funnel} />
          <p className="mt-6 text-sm text-foreground-subtle">
            People counted once, each step within seven days of their first page. Includes returning customers.
          </p>
        </Tile>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Tile title="What customers do with their plan" className="md:col-span-2">
            <PairedBars rows={behaviour.subscriptions} />
          </Tile>
          <Tile title="Not measured yet">
            <ul className="flex flex-col gap-5">
              {behaviour.notMeasured.map((item) => (
                <li key={item.label} className="text-ui">
                  <p className="text-foreground">{item.label}</p>
                  <p className="mt-0.5 text-foreground-subtle">Needs {item.needs}</p>
                </li>
              ))}
            </ul>
          </Tile>
        </div>
      </Section>

      <Section title="What people are saying" read={voice.read} sample>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Tile title="How it leans">
            <Donut mix={voice.mix} total={voice.total} unit="comments" />
          </Tile>
          <Tile title="Week by week" className="md:col-span-2">
            <StackedColumns weeks={voice.weeks} />
            <p className="mt-5 text-ui text-foreground-muted">{voice.shift}</p>
          </Tile>
        </div>

        <Tile title="What it is about">
          <ThemeBars themes={voice.themes} />
        </Tile>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {quotes.map((quote) => (
            <QuoteCard key={quote.text} text={quote.text} source={quote.source} theme={quote.theme} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Tile title="Where it came from">
            <SplitBar parts={voice.sources} />
          </Tile>
          <Tile title="Which market">
            <SplitBar parts={voice.markets} />
          </Tile>
        </div>
      </Section>
    </div>
  );
}
