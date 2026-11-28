import type { CollectionRequest } from "../core/collection";

// This boundary accepts only the public native request. Providers do not receive
// the workflow definition, private form, record, or verification history.
export interface CollectionProvider {
  handoff(request: CollectionRequest): {
    request: CollectionRequest;
    setup: string;
    recovery: string;
  };
  respondentLink(input: string): string;
}

function httpsLink(input: string) {
  if (input.length > 2048 || /[\p{Cc}\s]/u.test(input))
    throw Error("invalidRespondentUrl");
  const url = URL.parse(input);
  if (!url || url.protocol !== "https:" || url.username || url.password)
    throw Error("invalidRespondentUrl");
  return url;
}

const providers = new Map<string, CollectionProvider>([
  [
    "google-forms",
    {
      handoff: (request) => ({
        request,
        setup: "googleFormsOwnerDashboard",
        recovery: "googleFormsDriveRecovery",
      }),
      respondentLink: (input) => {
        const url = httpsLink(input);
        if (
          !(
            url.origin === "https://forms.gle" &&
            /^\/[a-zA-Z0-9_-]+$/.test(url.pathname)
          ) &&
          !(
            url.origin === "https://docs.google.com" &&
            /^\/forms\/(?:u\/\d+\/)?d\/(?:e\/)?[a-zA-Z0-9_-]+\/viewform\/?$/.test(
              url.pathname,
            )
          )
        )
          throw Error("invalidRespondentUrl");
        if ([...url.searchParams.keys()].some((key) => key !== "usp"))
          throw Error("invalidRespondentUrl");
        url.search = "";
        url.hash = "";
        return url.href;
      },
    },
  ],
  [
    "native-file",
    {
      handoff: (request) => ({
        request,
        setup: "offlineQuestionnaire",
        recovery: "manualFileImport",
      }),
      respondentLink: (input) => httpsLink(input).href,
    },
  ],
]);

export function collectionProvider(id: string) {
  const provider = providers.get(id);
  if (!provider) throw Error("unsupportedCollectionProvider");
  return provider;
}
