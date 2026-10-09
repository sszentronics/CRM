"use client";

import { Camera, LogOut } from "lucide-react";
import { useActionState, useRef, useTransition } from "react";
import { changeMyPassword, updateMyPhoto } from "@/app/(app)/profile/actions";
import { PageHeader } from "@/components/features/shell/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ROLE_LABEL } from "@/lib/auth/roles";
import type { Profile } from "@/lib/auth/session";
import { formatPhone } from "@/lib/format/phone";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { teamColorVar, type TeamColor } from "@/lib/teams";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-tl-line py-3 last:border-b-0">
      <dt className="text-label font-medium text-tl-muted">{label}</dt>
      <dd className="text-body text-tl-text">{children}</dd>
    </div>
  );
}

function PhotoCard({ profile, team }: { profile: Profile; team: { color: TeamColor } | null }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, startTransition] = useTransition();

  function onFile(file: File | undefined) {
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) return toast("Use a PNG, JPG or WebP image.", "error");
    if (file.size > MAX_PHOTO_BYTES) return toast("That photo is over 2 MB. Choose a smaller one.", "error");
    startTransition(async () => {
      const supabase = createBrowserSupabase();
      const ext = file.type.split("/")[1];
      const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type });
      if (error) {
        toast("The upload did not finish. Try again.", "error");
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const result = await updateMyPhoto(data.publicUrl);
      toast(result?.message ?? "Photo updated.", result?.ok ? "success" : "error");
    });
  }

  return (
    <Card className="flex flex-col items-center gap-4 text-center">
      <Avatar name={profile.full_name} src={profile.photo_url} size={96} team={team?.color} />
      <div className="flex flex-col gap-0.5">
        <p className="tl-display text-title text-tl-text">{profile.full_name}</p>
        <p className="text-body text-tl-muted">{ROLE_LABEL[profile.role]}</p>
      </div>
      <input
        ref={input}
        type="file"
        accept={PHOTO_TYPES.join(",")}
        className="sr-only"
        aria-label="Choose a profile photo"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy}>
        <Camera aria-hidden className="size-4" />
        {busy ? "Uploading" : "Change photo"}
      </Button>
      <p className="text-small text-tl-muted">PNG, JPG or WebP, up to 2 MB.</p>
    </Card>
  );
}

function PasswordCard() {
  const [state, action, pending] = useActionState(changeMyPassword, null);
  const form = useRef<HTMLFormElement>(null);
  useActionToast(state, () => form.current?.reset());
  return (
    <Card>
      <CardHeader title="Password" description="Use at least 10 characters." />
      <form ref={form} action={action} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            error={state?.fieldErrors?.password?.[0]}
          />
          <Input
            label="Type it again"
            name="confirm"
            type="password"
            autoComplete="new-password"
            error={state?.fieldErrors?.confirm?.[0]}
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving" : "Change password"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function ProfileScreen({
  profile,
  team,
}: {
  profile: Profile;
  team: { name: string; color: TeamColor } | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My profile"
        actions={
          <a href="/auth/signout?reason=signed-out" className={buttonVariants({ variant: "secondary" })}>
            <LogOut aria-hidden className="size-4" />
            Sign out
          </a>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[300px_1fr]">
        <PhotoCard profile={profile} team={team} />
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Details" description="Only the Superadmin can change these. Ask them if something is wrong." />
            <dl>
              <Detail label="Email">{profile.email}</Detail>
              <Detail label="Phone">
                {profile.phone ? <span className="tl-amount">{formatPhone(profile.phone)}</span> : "Not set"}
              </Detail>
              <Detail label="Role">{ROLE_LABEL[profile.role]}</Detail>
              <Detail label="Team">
                {team ? (
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: teamColorVar(team.color) }} />
                    {team.name}
                  </span>
                ) : (
                  "No team"
                )}
              </Detail>
            </dl>
          </Card>
          <PasswordCard />
        </div>
      </div>
    </div>
  );
}
