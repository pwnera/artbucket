import {
  IconBrandBluesky,
  IconBrandDiscord,
  IconBrandDribbble,
  IconBrandFigma,
  IconBrandGithub,
  IconBrandGitlab,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandNpm,
  IconBrandStorybook,
  IconBrandX,
  IconBrandYoutube,
  IconExternalLink,
} from "@/components/icons";
import { type LinkKind, linkKind } from "@/lib/site";

const ICONS: Record<LinkKind, typeof IconExternalLink> = {
  github: IconBrandGithub,
  gitlab: IconBrandGitlab,
  figma: IconBrandFigma,
  npm: IconBrandNpm,
  storybook: IconBrandStorybook,
  x: IconBrandX,
  linkedin: IconBrandLinkedin,
  youtube: IconBrandYoutube,
  discord: IconBrandDiscord,
  instagram: IconBrandInstagram,
  dribbble: IconBrandDribbble,
  bluesky: IconBrandBluesky,
  web: IconExternalLink,
};

/** A theme link's icon (lib/site.ts linkKind): its host's mark, else a plain link out. */
export function SiteLinkIcon({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const Icon = ICONS[linkKind(url)];
  return <Icon aria-hidden className={className} />;
}
