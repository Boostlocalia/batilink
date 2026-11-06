import { type ReactNode } from "react";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/components/ui";
import { useTheme } from "@/hooks/use-theme";
import { useI18n } from "@/i18n";
import { useFounder } from "@/lib/founders";
import { useSession } from "@/lib/session";

/** The company's founder number and price guarantee; `fallback` for companies that are not founders. */
export function FounderStatus({ fallback }: { fallback: ReactNode }) {
  const { t } = useI18n();
  const f = t.growth.founders;
  const theme = useTheme();
  const { company } = useSession();
  const founder = useFounder(company?.id);

  if (founder === undefined) return null;
  if (!founder) return <>{fallback}</>;
  return (
    <Card style={!founder.ended ? { borderColor: theme.signal } : undefined}>
      <ThemedText
        type="subtitle"
        themeColor={founder.ended ? undefined : "signal"}
      >
        {f.member(founder.number)}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {founder.ended ? f.memberEnded(founder.number) : f.memberLead}
      </ThemedText>
      {!founder.ended ? (
        <ThemedText type="small" themeColor="textSecondary">
          {founder.plan === "pro" && !founder.changed
            ? f.memberUpgrade
            : f.memberLocked}
        </ThemedText>
      ) : null}
    </Card>
  );
}
