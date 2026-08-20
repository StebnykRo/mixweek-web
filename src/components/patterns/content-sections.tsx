import { Card } from '@/components/ui/card';
import { Markdown } from './markdown';
import { EmptyState } from '@/components/ui/empty-state';

export type ContentBlockView = {
  id: string;
  title: string;
  body: string;
  icon: string | null;
};

/** Shared by EventStyle, Travel and Help — one Markdown card per block. */
export function ContentSections({ blocks, emptyTitle }: { blocks: ContentBlockView[]; emptyTitle: string }) {
  if (blocks.length === 0) return <EmptyState title={emptyTitle} />;
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block) => (
        <Card key={block.id}>
          <div className="p-5">
            <h2 className="font-display text-xl">{block.title}</h2>
            <Markdown source={block.body} className="mt-2" />
          </div>
        </Card>
      ))}
    </div>
  );
}
