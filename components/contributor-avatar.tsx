'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Contributor } from '@/lib/catalog';

export function ContributorAvatar({
  contributor,
  small = false,
}: {
  contributor: Contributor;
  small?: boolean;
}) {
  return (
    <Avatar className="contributor-avatar" size={small ? 'sm' : 'default'}>
      <AvatarImage src={contributor.avatarUrl} alt="" />
      <AvatarFallback aria-hidden="true">
        {contributor.name.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
