"use client";

import Link from "next/link";
import { IconBook, IconInbox, IconPalette, IconPhoto } from "@tabler/icons-react";
import { Logo, ThemeToggle } from "@/components/brand";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

export type Place = "files" | "review" | "brand";

/**
 * The app's one sidebar: the mark, the places (files, review, the brand),
 * whatever the current page adds, and the footer. A place is an in-page
 * action where the page offers one (the library switching views without a
 * reload), a link otherwise.
 */
export function AppSidebar({
  place,
  onFiles,
  onReview,
  children,
  footer,
}: {
  place: Place | null;
  onFiles?: () => void;
  onReview?: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { setOpenMobile } = useSidebar();
  // On a phone the sidebar is a sheet; going somewhere should reveal it.
  const close = () => setOpenMobile(false);

  const item = (at: Place, label: string, icon: React.ReactNode, href: string, action?: () => void) => (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={place === at}
        tooltip={label}
        asChild={!action}
        onClick={
          action
            ? () => {
                action();
                close();
              }
            : undefined
        }
      >
        {action ? (
          <>
            {icon} <span>{label}</span>
          </>
        ) : (
          <Link href={href} onClick={close}>
            {icon} <span>{label}</span>
          </Link>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="gap-3">
              <Link
                href="/"
                onClick={(e) => {
                  if (!onFiles) return;
                  e.preventDefault();
                  onFiles();
                  close();
                }}
              >
                <Logo />
                <span className="truncate text-base font-semibold tracking-tight">Artbucket</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {item("files", "All files", <IconPhoto />, "/", onFiles)}
              {item("review", "Review", <IconInbox />, "/?review", onReview)}
              {item("brand", "Brand guidelines", <IconBook />, "/brand")}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {children}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {footer}
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Design system">
              <Link href="/design">
                <IconPalette /> <span>Design system</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="flex justify-end group-data-[collapsible=icon]:justify-center">
            <ThemeToggle />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
