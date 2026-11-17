# Email deliverability

Login codes, password codes and notification emails are sent from the app. Until the domain says
these are allowed, inboxes treat them as forged mail and drop them into spam, so people never see
their code. Three DNS records fix it. They are added at the company's DNS provider, not in code.

## 1. Find the real sender first

```bash
ssh <api user>@<vps host> 'grep -E "^(SMTP_|MAIL_|EMAIL_)" ~/htdocs/api.karyaos.in/.env | sed "s/=.*/=<set>/"'
```

That prints only the key names, never the values. The host in `SMTP_HOST` is the mail provider and
`SMTP_USER` or `MAIL_FROM` holds the address people see. Every record below depends on that
provider, so do not copy values from another setup.

## 2. SPF, one TXT record on the domain root

Name `@` (or `karyaos.in`), type TXT. One SPF record per domain, never two.

```
v=spf1 include:<provider spf host> ~all
```

Take `<provider spf host>` from the provider's own SPF page: Google Workspace `_spf.google.com`,
Microsoft 365 `spf.protection.outlook.com`, Zoho `zoho.in`, Brevo `spf.brevo.com`, Amazon SES
`amazonses.com`. If a TXT record starting `v=spf1` already exists, add the include to that record
instead of creating a second one.

## 3. DKIM, the signature the provider generates

DKIM cannot be written by hand. In the provider's console open the sending-domain or
authentication page, generate the key for `karyaos.in`, and it gives a host like
`<selector>._domainkey` and a long TXT value starting `v=DKIM1;`. Add that record exactly as given,
then press Verify in the console. Nothing is signed until that check passes.

## 4. DMARC, one TXT record

Name `_dmarc`, type TXT. Start in monitor mode so no real mail is rejected while the first two
records settle.

```
v=DMARC1; p=none; rua=mailto:dmarc@karyaos.in; fo=1
```

After two weeks of clean reports, tighten it to `p=quarantine`, and later `p=reject`.

## 5. Check it worked

- `nslookup -type=TXT karyaos.in` shows the SPF record.
- `nslookup -type=TXT <selector>._domainkey.karyaos.in` shows the DKIM record.
- `nslookup -type=TXT _dmarc.karyaos.in` shows the DMARC record.
- Send a login code to a Gmail address, open the message, choose Show original, and confirm SPF,
  DKIM and DMARC all read PASS.

DNS takes up to an hour, sometimes a day, to spread.

## 6. Until all three pass

Keep "Require a code to sign in" turned OFF for admins in Settings. With it on and mail in spam,
admins cannot sign in at all.
