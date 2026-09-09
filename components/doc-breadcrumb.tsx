import Link from '@/components/static-link';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

export function DocBreadcrumb({
  id,
  title,
  cookbook = false,
}: {
  id: string;
  title: string;
  cookbook?: boolean;
}) {
  return (
    <Breadcrumb className="doc-breadcrumb">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link href="/" />}>Plugins</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          {cookbook ? (
            <BreadcrumbLink render={<Link href={`/plugins/${id}/`} />}>
              {title}
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage>{title}</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {cookbook && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Cookbook</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
