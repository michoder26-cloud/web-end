# Install web-end, step by step

It's all free, with no monthly fees, on your own accounts. You need three: [Cloudflare](https://dash.cloudflare.com/sign-up), [GitHub](https://github.com/signup) and, if you want to build by chatting, [Claude](https://claude.ai).

It takes about 5–10 minutes. Cloudflare and GitHub sometimes rename their buttons a little, so look for the one that means the same thing.

## 1. Press the install button

1. Open the [web-end page](https://github.com/michoder26-cloud/web-end) and press **Deploy to Cloudflare**.
2. Sign in to Cloudflare, or create a free account.
3. Cloudflare asks to connect to GitHub. Allow it. When GitHub asks which repositories it may use, choose **Only select repositories**, so your other projects stay out of it.
4. Name your site, such as `baan-coffee`, using only lowercase letters, numbers and `-`. Leave the other fields as Cloudflare filled them in.
5. Press the create or deploy button and wait 2–5 minutes.
6. **If you land somewhere else**, such as the GitHub or Cloudflare home page, press **Deploy to Cloudflare** again. Cloudflare remembers what's already done.

## 2. Open your website

1. When Cloudflare is done, it shows an address ending in **`.workers.dev`**, such as `baan-coffee.your-name.workers.dev`.
2. Click that address, or press **Visit**.
3. Can't find it? In Cloudflare, open **Workers & Pages**, click your site's name, and look for the address ending in `.workers.dev`.

## 3. Start building

1. On your new website, press **Start building free**. The first person to press it becomes the owner, so do it right after installing.
2. Pick one way, not both:
   - **Start from an example.** Choose the one closest to your business (a café, an online shop, classes and bookings, services, or a portfolio) and get a working sample site at once.
   - **Build with Claude.** Follow the 3 steps on screen: copy the link, open Claude and paste it under **Add custom connector**, then send the first message.

## 4. Create your sign-in (important, once)

At first, the back office address is the only key to your back office, so it shows a **Create your sign-in** box.

1. Type your name, email and a password of at least 8 characters, then press **Create owner account**. There's nothing to paste.
2. From then on, open `your-site-address/admin` and sign in with that email and password, on any device.
3. To connect Claude later, go to `/admin`, find the Claude section and press **Make my Claude link**.

## 5. Publish

When you're happy, press **Publish** at the top right of the back office. After that, your changes stay private until you publish again.

## Automatic updates

Sites installed from version 0.20 on update themselves once a day whenever there's a new version. You don't need to do anything. For a site installed earlier, open **Updates** in the back office (under **More**) and follow the steps there: one click, then **Commit changes**.

## If something goes wrong

- **The site shows a blank page or an error.** Wait 2–3 minutes and refresh. Cloudflare may still be building it.
- **You forgot your password.** Open `/admin/recover` and use your private owner link, the back office link you got at the start.
- **You want emails from your site.** Email needs a domain of your own and a Resend account. Without a domain, get free notices of new orders and messages in Telegram or Discord on the **Connect** page instead.
