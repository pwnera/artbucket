# ee/

Reserved, and empty.

Everything else in this repository is AGPLv3 ([LICENSE](../LICENSE)). Code
here, when there is any, will be under a separate commercial license, the way
Cal.com and Plausible do it, so the hosting can't be resold without giving
back ([decision 0009](../docs/decisions/0009-agpl-and-ee.mdx)).

What may land here: organization-scale governance (SAML, SCIM, custom roles,
retention and legal hold) and hosting scale. What never will: single sign-on
over OpenID Connect, the audit log, access control, or any security fix. Those
stay in the core, free ([decision 0006](../docs/decisions/0006-grants-and-free-sso.mdx)).

Nothing in the core imports from here, and it runs complete without it.
