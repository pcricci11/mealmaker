# MealMaker Product Launch Roadmap

## Complete Roadmap Timeline

| Phase | Timeline | Focus |
|-------|----------|-------|
| Phase 1 | Week 1–3 | Optimization & Polish |
| Phase 2 | Week 4–11 | Beta Testing (20 friends) |
| Phase 3 | Week 8–11 | Mobile Version (parallel with beta) |
| Phase 4 | Week 12–14 | Launch Preparation |
| Phase 5 | Week 15 | **PUBLIC LAUNCH** |
| Growth | Month 4–6 | Growth & Iteration |
| Scale | Month 7–12 | Scale to 500 Users |

---

## Phase 1: Optimization & Polish (2–3 Weeks)

### Technical Optimization

**Speed & Cost Reduction**

- Batch recipe searches (1 API call instead of 3–5)
- Cache common recipes in database
- Implement lazy ingredient extraction
- Add prompt caching for repeated queries
- **Target:** 3–5 seconds per generation, $0.05–0.10 per plan

**Smart Features**

- Wire favorite chefs/sources into recipe selection
- Claude-powered smart side pairing
- Fix Smart Setup button flow
- Add voice input (Web Speech API)

**Polish & Bug Fixes**

- Clean up duplicate recipes in database
- Add error handling throughout
- Loading states everywhere
- Mobile-responsive design improvements

### Phase 1 Economics

| Item | Cost |
|------|------|
| Your time | 20–30 hours |
| API costs (testing) | ~$20–30 |
| **Total** | **$20–30 + your time** |

---

## Phase 2: Beta Testing (3–4 Weeks)

### Prepare for Beta

**Security & Data**

- Add user authentication (Clerk, Auth0, or Supabase Auth)
- Multi-family database architecture
- Data privacy/encryption
- Terms of Service + Privacy Policy

**Infrastructure**

- Deploy backend (Railway, Render, or Fly.io)
- Deploy frontend (Vercel or Netlify)
- Set up monitoring (Sentry for errors)
- Database backup strategy

### Beta Testing with 10–20 Friends

**API Cost Projection**

| Metric | Value |
|--------|-------|
| Active users | 15 (assume 10–20, avg 15) |
| Plans per user/week | 2 |
| Plans per month | 120 |
| Cost per plan | $0.10 |
| Monthly API cost | $12 |
| With 50% buffer | **~$18/month** |

**Infrastructure Costs**

| Service | Monthly Cost |
|---------|-------------|
| Backend hosting (Railway/Render) | $5–15 |
| Frontend hosting (Vercel) | Free |
| Database (PostgreSQL) | $0–10 |
| Domain | $1 ($12/year) |
| **Total infrastructure** | **~$20–30/month** |

**Phase 2 Total Monthly Cost: ~$40–50/month**

### What You Need for Beta

- Feedback forms/surveys
- Analytics (PostHog or Mixpanel free tier)
- Support channel (Discord or email)
- Weekly check-ins with beta users

---

## Phase 3: Mobile Version (4–6 Weeks, Parallel with Beta)

### Options Comparison

| | Option A: PWA | Option B: React Native | Option C: Expo |
|---|---|---|---|
| **Effort** | 10–15 hours | 40–60 hours | 30–40 hours |
| **Cost** | Your time only | $99/yr Apple + $25 Google | Store fees |
| **App Store** | No | Yes | Yes |
| **Code reuse** | Full (same codebase) | Some React components | Shared with web |
| **Pros** | Fast, cheap, same code | True native, in stores | Easier than pure RN |
| **Cons** | Not in stores, some limits | Two codebases | Still two codebases |

**Recommendation:** Start with **PWA (Option A)**, upgrade to React Native later if needed.

---

## Phase 4: Launch Preparation (2–3 Weeks)

### Pre-Launch Checklist

**Legal & Business**

- LLC formation ($100–300)
- Terms of Service (template + lawyer review: $300–500)
- Privacy Policy (GDPR/CCPA compliant)
- Stripe/payment integration

**Marketing Assets**

- Landing page with waitlist
- Demo video (1–2 min)
- Social media presence (Instagram, TikTok for food/family niche)
- Press kit

**Final Testing**

- Load testing (what if 100 users?)
- Security audit (basic penetration testing)
- Payment flow testing

### Phase 4 Costs

| Item | Cost |
|------|------|
| Legal | $400–800 (one-time) |
| Domain/hosting | $30/month (ongoing) |
| Marketing tools | $0–50/month |
| **Total** | **~$500–1,000 one-time + $30–80/month** |

---

## Phase 5: Public Launch

### Pricing Model Analysis

**Cost Structure at 100 Active Users**

| Item | Monthly Cost |
|------|-------------|
| API costs (800 plans @ $0.10) | $80 |
| Infrastructure (upgraded hosting) | $50 |
| Support/maintenance (10 hrs @ $50/hr) | $500 |
| **Total** | **~$630** |
| **Cost per user** | **$6.30/month** |

### Recommended Pricing Tiers

| Tier | Price | Features | Margin |
|------|-------|----------|--------|
| **Free** | $0 | 2 plans/month, basic features, limited sources | Acquisition funnel |
| **Starter** | $9.99/month | Unlimited plans, full recipe search, grocery list export, email support | $3.69/user (37%) |
| **Family** | $14.99/month | Everything in Starter + up to 6 family members, favorite chefs, recipe history, priority support | $8.69/user (58%) |

**Why this pricing works:**

- Competitive with meal kit services ($60–120/month) — fraction of the cost
- Higher value perception than recipe apps (~$5/month)
- Saves users real time = worth $15/month
- Family plan targets the core audience

### Launch Economics

**Conservative Scenario (First 6 Months)**

| Month | Paying Users | Monthly Revenue |
|-------|-------------|-----------------|
| 1 | 50 | $600 |
| 2 | 80 | $960 |
| 3 | 120 | $1,440 |
| 4 | 150 | $1,800 |
| 5 | 175 | $2,100 |
| 6 | 200 | $2,400 |
| **Total** | | **~$9,000** |

*Average plan price: $12/month (mix of $9.99 and $14.99)*

**6-Month Cost Breakdown**

| Item | 6-Month Cost |
|------|-------------|
| API | $3,000 (avg $500/month) |
| Infrastructure | $360 |
| Marketing | $1,500 |
| Support | $3,000 (10 hrs/month @ $50/hr) |
| Legal/misc | $1,000 |
| **Total** | **~$8,860** |

**First 6 months: ~Break even to +$140** (validation, not profit)

### Year 1 Goal: 500 Paying Users

| Metric | Value |
|--------|-------|
| Monthly revenue | $6,000 |
| Monthly costs | $3,500 |
| **Monthly profit** | **$2,500** |
| **Annual profit** | **$30,000** |

---

## Marketing Strategy

### Pre-Launch (Weeks 1–4) — Cost: $0–200

- Build waitlist landing page
- Instagram/TikTok content (meal planning tips, behind-the-scenes)
- Mom blogger outreach
- Reddit (r/MealPrepSunday, r/EatCheapAndHealthy)

### Launch (Month 1–3) — Cost: $1,000–1,500/month

- Product Hunt launch
- Facebook ads targeting parents 30–45 ($20/day = $600/month)
- Influencer partnerships (micro-influencers, $100–500 each)
- Referral program (free month for referrals)

### Growth (Month 4–12) — Cost: $500–1,000/month

- SEO content (meal planning guides, recipe roundups)
- Partnerships (grocery delivery services, meal kit companies)
- User-generated content campaign

---

## Total Investment Required

### Pre-Launch (One-Time)

| Item | Cost |
|------|------|
| Legal/business | $500–1,000 |
| Initial marketing | $500 |
| **Total** | **$1,000–1,500** |

### First 6 Months (Recurring)

~$9,000 total (likely breakeven with revenue)

### To Reach Profitability (500 Users)

| Metric | Value |
|--------|-------|
| Time | 12 months |
| Capital needed | $15,000–20,000 (can bootstrap with revenue) |
| Your time | 300–400 hours over 12 months |

### ROI at 500 Users

| Metric | Value |
|--------|-------|
| Monthly profit | $2,500 |
| Annual profit | $30,000 |
| Can reinvest or take as income | |

---

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| Claude API costs spiral | Strict rate limiting, caching, monitor daily |
| Low conversion from free to paid | 2-week trial, feature limits that create upgrade pressure |
| Competition (ChefGPT, etc.) | Focus on family angle, personalization, favorite chefs |
| Technical issues at scale | Beta testing, monitoring, gradual rollout |

---

## Decision Points

### Should you proceed?

**YES if:**

- [ ] You can invest 20–30 hours/month for 12 months
- [ ] You have $2,000–3,000 available to invest
- [ ] You're excited about building a business
- [ ] Beta users love it

**RECONSIDER if:**

- [ ] API costs exceed $1,000/month in beta
- [ ] Beta users churn quickly
- [ ] You can't commit the time
