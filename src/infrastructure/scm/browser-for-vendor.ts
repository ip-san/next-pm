import type { ScmVendor } from "@/domain/scm/entity";
import type { ScmBrowser } from "@/domain/scm/scm-browser";
import { GitCliBrowser } from "./git-cli-browser";
import { MercurialCliBrowser } from "./mercurial-cli-browser";
import { SubversionCliBrowser } from "./subversion-cli-browser";

export function scmBrowserFor(vendor: ScmVendor): ScmBrowser {
  switch (vendor) {
    case "git":
      return new GitCliBrowser();
    case "subversion":
      return new SubversionCliBrowser();
    case "mercurial":
      return new MercurialCliBrowser();
  }
}
