"use client";
import { useActionState } from "react";
import { updateProfileAction } from "./actions";
import { FormMessage } from "@/components/form-message";

export function ProfileForm({
  initial,
}: {
  initial: {
    displayName: string;
    activisionId: string | null;
    streamUrl: string | null;
    bio: string;
  };
}) {
  const [result, action, pending] = useActionState(updateProfileAction, null);
  return (
    <form action={action} className="card mt-6 space-y-3">
      <div>
        <label className="label" htmlFor="displayName">
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          className="input"
          defaultValue={initial.displayName}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="activisionId">
          Activision ID
        </label>
        <input
          id="activisionId"
          name="activisionId"
          className="input"
          defaultValue={initial.activisionId ?? ""}
          placeholder="Name#1234567"
        />
      </div>
      <div>
        <label className="label" htmlFor="streamUrl">
          Stream link
        </label>
        <input
          id="streamUrl"
          name="streamUrl"
          className="input"
          defaultValue={initial.streamUrl ?? ""}
          placeholder="https://twitch.tv/you"
        />
      </div>
      <div>
        <label className="label" htmlFor="bio">
          Bio
        </label>
        <textarea id="bio" name="bio" className="input" rows={3} defaultValue={initial.bio} />
      </div>
      <FormMessage
        error={result && !result.ok ? result.error : null}
        ok={result?.ok ? result.message : null}
      />
      <button className="btn btn-primary" disabled={pending}>
        Save
      </button>
    </form>
  );
}
