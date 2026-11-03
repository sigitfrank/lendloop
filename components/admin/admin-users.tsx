"use client";

import { useMutation, usePaginatedQuery, type UsePaginatedQueryReturnType } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowUpRight, Package, PackageCheck, ShieldCheck, ShieldOff, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { IconButton } from "@/components/icon-button";
import { PaginationControls } from "@/components/pagination-controls";
import { TrustedLenderBadge } from "@/components/status-badges";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useNow } from "@/hooks/use-now";
import { useNumberedPages } from "@/hooks/use-numbered-pages";
import type { UserListParams } from "@/lib/admin-params";
import { errorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/time";

type AdminUser = FunctionReturnType<typeof api.admin.users>["page"][number];
type UsersQuery = UsePaginatedQueryReturnType<typeof api.admin.users>;

const PAGE_SIZE = 12;

/** Members, with the Trusted Lender toggle. */
export function AdminUsers({ params }: { params: UserListParams }) {
  const { show, q, sort, view } = params;
  const query = usePaginatedQuery(
    api.admin.users,
    { filter: show, search: q, sort },
    { initialNumItems: PAGE_SIZE },
  );

  if (query.status === "LoadingFirstPage") {
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }
  if (query.results.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={q ? `No members match “${q}”` : "No members here"}
        description="Try another filter or search."
      />
    );
  }
  return view === "table" ? (
    <PagedUserTable key={`${show}|${q}|${sort}`} query={query} />
  ) : (
    <InfiniteUserGrid query={query} />
  );
}

function TrustedToggle({ user }: { user: AdminUser }) {
  const setTrusted = useMutation(api.admin.setTrustedLender);
  const [saving, setSaving] = useState(false);
  const next = !user.trustedLender;

  async function toggle() {
    setSaving(true);
    try {
      await setTrusted({ userId: user._id, trusted: next });
      toast.success(next ? `${user.name} is now a Trusted Lender` : `Removed Trusted Lender from ${user.name}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <IconButton
      icon={next ? ShieldCheck : ShieldOff}
      label={next ? "Mark as Trusted Lender" : "Remove Trusted Lender"}
      tone={next ? "default" : "danger"}
      onClick={toggle}
      disabled={saving}
    />
  );
}

/** Counts are capped server-side; 100 means "100 or more". */
function formatCount(n: number) {
  return n >= 100 ? "99+" : String(n);
}

const STATS = [
  { key: "listings", label: "Listings", unit: "listings", hint: "Tools listed now", icon: Package },
  { key: "lent", label: "Lent", unit: "lent", hint: "Loans returned to them", icon: PackageCheck },
  { key: "borrowed", label: "Borrowed", unit: "borrowed", hint: "Loans as borrower", icon: ArrowUpRight },
] as const;

/** Compact track record: "2 listings · 1 lent · 0 borrowed". */
function UserStats({ user }: { user: AdminUser }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Activity">
      {STATS.map(({ key, unit, hint, icon: Icon }) => (
        <li key={key} className="flex items-center gap-1.5" title={hint}>
          <Icon className="size-3.5" aria-hidden />
          <span className="font-medium text-foreground tabular-nums">
            {formatCount(user.stats[key])}
          </span>
          {unit}
        </li>
      ))}
    </ul>
  );
}

function UserBadges({ user }: { user: AdminUser }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {user.role === "admin" && <Badge variant="secondary">Admin</Badge>}
      {user.trustedLender && <TrustedLenderBadge />}
    </div>
  );
}

function UserCards({ users }: { users: AdminUser[] }) {
  const now = useNow();
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {users.map((user) => (
        <li key={user._id}>
          <Card className="h-full">
            <CardHeader>
              {/* Profile */}
              <div className="flex items-start gap-3">
                <UserAvatar name={user.name} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="truncate text-base">{user.name}</CardTitle>
                    <UserBadges user={user} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {user.email ?? "No email"}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  Joined {timeAgo(user._creationTime, now)}
                </p>
              </div>
            </CardHeader>
            {/* Activity, separated from the profile */}
            <CardContent className="flex-1">
              <div className="border-t pt-3">
                <UserStats user={user} />
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <TrustedToggle user={user} />
            </CardFooter>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function InfiniteUserGrid({ query }: { query: UsersQuery }) {
  const sentinel = useInfiniteScroll(query.status, query.loadMore, PAGE_SIZE);
  return (
    <div className="space-y-6">
      <UserCards users={query.results} />
      <div ref={sentinel} aria-hidden />
      {query.status === "LoadingMore" && <Skeleton className="h-32 w-full rounded-xl" />}
    </div>
  );
}

function PagedUserTable({ query }: { query: UsersQuery }) {
  const pages = useNumberedPages(query.results, query.status, query.loadMore, PAGE_SIZE);
  const now = useNow();

  return (
    <div className="space-y-4">
      {/* Phones: the table collapses to cards. */}
      <div className="sm:hidden">
        <UserCards users={pages.rows} />
      </div>
      <div className="hidden overflow-hidden rounded-xl border bg-card sm:block">
        {pages.waiting ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                {STATS.map(({ key, label, hint }) => (
                  <TableHead key={key} className="text-right" title={hint}>
                    {label}
                  </TableHead>
                ))}
                <TableHead>Joined</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.rows.map((user) => (
                <TableRow key={user._id}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2.5 font-medium">
                      <UserAvatar name={user.name} size="sm" />
                      {user.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email ?? "—"}</TableCell>
                  <TableCell>
                    <UserBadges user={user} />
                  </TableCell>
                  {STATS.map(({ key }) => (
                    <TableCell key={key} className="text-right tabular-nums">
                      {formatCount(user.stats[key])}
                    </TableCell>
                  ))}
                  <TableCell className="text-muted-foreground">
                    {timeAgo(user._creationTime, now)}
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex justify-end">
                      <TrustedToggle user={user} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <PaginationControls pages={pages} />
    </div>
  );
}
