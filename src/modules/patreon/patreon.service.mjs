import axios from "axios";
import jwt from "jsonwebtoken";
import { config } from "../../config/config.mjs";
import { prisma } from "../../db/prisma.mjs";

class PatreonService {
  /**
   * Generate Patreon OAuth URL
   */
  getAuthUrl(intent = "login", returnUrl = "") {
    const clientId = config.patreon_client_id;
    const redirectUri = config.patreon_redirect_uri;
    const scope = "identity identity[email] identity.memberships";

    // Encode intent and returnUrl into state
    const stateObj = {
      intent: intent === "subscribe" ? "subscribe" : "login",
      returnUrl: returnUrl || "",
    };
    const state = Buffer.from(JSON.stringify(stateObj)).toString("base64");

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scope,
      state: state,
    });

    if (intent === "subscribe" && config.patreon_campaign_id) {
      params.set("campaign_id", config.patreon_campaign_id);
    }

    return `https://www.patreon.com/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code) {
    try {
      const body = new URLSearchParams();
      body.set("code", code);
      body.set("grant_type", "authorization_code");
      body.set("client_id", config.patreon_client_id);
      body.set("client_secret", config.patreon_client_secret);
      body.set("redirect_uri", config.patreon_redirect_uri);

      const response = await axios.post(
        "https://www.patreon.com/api/oauth2/token",
        body.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
        },
      );
      return response.data;
    } catch (error) {
      console.error("Error exchanging code for token:");
      console.error("Status:", error.response?.status);
      console.error("Status Text:", error.response?.statusText);
      console.error(
        "Response Data:",
        JSON.stringify(error.response?.data, null, 2),
      );
      console.error("Error Message:", error.message);
      console.error("Request Config:", {
        url: error.config?.url,
        method: error.config?.method,
        data: error.config?.data,
      });
      throw new Error(
        `Failed to exchange authorization code: ${error.response?.data?.error || error.message}`,
      );
    }
  }

  /**
   * Get Patreon user identity
   */
  async getPatreonIdentity(accessToken) {
    try {
      const url =
        "https://www.patreon.com/api/oauth2/v2/identity?include=memberships,memberships.campaign" +
        "&fields[user]=email,full_name" +
        "&fields[member]=patron_status,currently_entitled_amount_cents,pledge_relationship_start";
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 10000, // 10 seconds
      });

      return response.data;
    } catch (error) {
      console.error("❌ Error fetching Patreon identity:");
      console.error("Status:", error.response?.status);
      console.error("Status Text:", error.response?.statusText);
      console.error(
        "Response Data:",
        JSON.stringify(error.response?.data, null, 2),
      );
      console.error("Error Message:", error.message);
      console.error("Access Token:", accessToken?.substring(0, 20) + "...");
      throw new Error("Failed to fetch Patreon user data");
    }
  }

  /**
   * Verify if user is an active patron
   */
  async verifyPatronStatus(accessToken) {
    const identity = await this.getPatreonIdentity(accessToken);

    const user = identity.data;
    const memberships = identity.included?.filter(
      (item) => item.type === "member",
    );

    let isActivePatron = false;
    let pledgeAmountCents = 0;
    let membershipTier = null;
    const requiredCampaignId =
      config.patreon_campaign_id &&
      config.patreon_campaign_id !== "your_campaign_id_here"
        ? config.patreon_campaign_id
        : null;

    if (memberships && memberships.length > 0) {
      const activeMembership = memberships.find((m) => {
        const isActive = m.attributes.patron_status === "active_patron";
        if (!isActive) return false;
        if (!requiredCampaignId) return true;
        const relCampaignId = m.relationships?.campaign?.data?.id;
        return relCampaignId === requiredCampaignId;
      });

      if (activeMembership) {
        isActivePatron = true;
        pledgeAmountCents =
          activeMembership.attributes.currently_entitled_amount_cents || 0;

        // Determine tier based on pledge amount
        if (pledgeAmountCents >= 1000) {
          membershipTier = "premium";
        } else if (pledgeAmountCents >= 500) {
          membershipTier = "standard";
        } else if (pledgeAmountCents > 0) {
          membershipTier = "basic";
        }
      }
    }

    return {
      patreonId: user.id,
      email: user.attributes.email,
      fullName: user.attributes.full_name,
      isActivePatron,
      pledgeAmountCents,
      membershipTier,
    };
  }

  /**
   * Handle OAuth callback and create/update user
   */
  async handleOAuthCallback(code) {
    // Exchange code for tokens
    const tokenData = await this.exchangeCodeForToken(code);
    const { access_token, refresh_token, expires_in } = tokenData;

    // Get user data and verify patron status
    const patronData = await this.verifyPatronStatus(access_token);

    const isActive = patronData.isActivePatron;

    // Calculate token expiry
    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

    // Create or update user in database ALWAYS
    const patreonUser = await prisma.patreonUser.upsert({
      where: { patreon_id: patronData.patreonId },
      update: {
        email: patronData.email,
        full_name: patronData.fullName,
        access_token,
        refresh_token,
        token_expires_at: tokenExpiresAt,
        membership_tier: patronData.membershipTier,
        is_active_patron: isActive,
        pledge_amount_cents: patronData.pledgeAmountCents || 0,
        last_verified_at: new Date(),
      },
      create: {
        patreon_id: patronData.patreonId,
        email: patronData.email,
        full_name: patronData.fullName,
        access_token,
        refresh_token,
        token_expires_at: tokenExpiresAt,
        membership_tier: patronData.membershipTier,
        is_active_patron: isActive,
        pledge_amount_cents: patronData.pledgeAmountCents || 0,
      },
    });

    // Generate JWT for our application
    const appToken = jwt.sign(
      {
        id: patreonUser.id,
        patreonId: patreonUser.patreon_id,
        email: patreonUser.email,
        membershipTier: patreonUser.membership_tier,
        isActivePatron: patreonUser.is_active_patron,
      },
      config.jwt_secret,
      {
        expiresIn: "7d",
      },
    );

    return {
      user: {
        id: patreonUser.id,
        email: patreonUser.email,
        fullName: patreonUser.full_name,
        membershipTier: patreonUser.membership_tier,
        isActivePatron: patreonUser.is_active_patron,
        pledgeAmount: (patreonUser.pledge_amount_cents || 0) / 100, // Convert to dollars
      },
      token: appToken,
    };
  }

  /**
   * Refresh Patreon access token
   */
  async refreshAccessToken(refreshToken) {
    try {
      const body = new URLSearchParams();
      body.set("grant_type", "refresh_token");
      body.set("refresh_token", refreshToken);
      body.set("client_id", config.patreon_client_id);
      body.set("client_secret", config.patreon_client_secret);

      const response = await axios.post(
        "https://www.patreon.com/api/oauth2/token",
        body.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      return response.data;
    } catch (error) {
      console.error("Error refreshing token:", error.response?.data);
      throw new Error("Failed to refresh access token");
    }
  }

  /**
   * Verify user's current patron status
   */
  async verifyUserPatronStatus(userId) {
    const user = await prisma.patreonUser.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Check if token is expired
    const now = new Date();
    if (now >= user.token_expires_at) {
      // Refresh token
      const tokenData = await this.refreshAccessToken(user.refresh_token);
      const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

      // Update tokens
      await prisma.patreonUser.update({
        where: { id: userId },
        data: {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: tokenExpiresAt,
        },
      });

      // Verify with new token
      const patronData = await this.verifyPatronStatus(tokenData.access_token);

      // Update patron status
      await prisma.patreonUser.update({
        where: { id: userId },
        data: {
          is_active_patron: patronData.isActivePatron,
          membership_tier: patronData.membershipTier,
          pledge_amount_cents: patronData.pledgeAmountCents,
          last_verified_at: new Date(),
        },
      });

      return patronData.isActivePatron;
    } else {
      // Token still valid, verify status
      const patronData = await this.verifyPatronStatus(user.access_token);

      // Update patron status
      await prisma.patreonUser.update({
        where: { id: userId },
        data: {
          is_active_patron: patronData.isActivePatron,
          membership_tier: patronData.membershipTier,
          pledge_amount_cents: patronData.pledgeAmountCents,
          last_verified_at: new Date(),
        },
      });

      return patronData.isActivePatron;
    }
  }

  /**
   * Get all Patreon users with pagination, search, and filtering (for admin)
   */
  async getAllPatreonUsers({
    page = 1,
    limit = 10,
    order = "desc",
    search = "",
    status = "",
  } = {}) {
    const where = {};

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [{ full_name: { contains: q } }, { email: { contains: q } }];
    }

    if (status === "active") {
      where.is_active_patron = true;
    } else if (status === "inactive") {
      where.is_active_patron = false;
    }

    const safeLimit = Math.min(Math.max(parseInt(limit) || 10, 1), 1000);
    const safePage = Math.max(parseInt(page) || 1, 1);
    const sortOrder = order === "asc" ? "asc" : "desc";

    const [users, total] = await Promise.all([
      prisma.patreonUser.findMany({
        where,
        select: {
          id: true,
          patreon_id: true,
          email: true,
          full_name: true,
          membership_tier: true,
          is_active_patron: true,
          pledge_amount_cents: true,
          last_verified_at: true,
          created_at: true,
        },
        orderBy: {
          created_at: sortOrder,
        },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      prisma.patreonUser.count({ where }),
    ]);

    const result = users.map((user) => ({
      ...user,
      pledge_amount: user.pledge_amount_cents
        ? user.pledge_amount_cents / 100
        : 0,
    }));

    return {
      result,
      pagination: {
        total,
        totalPages: Math.ceil(total / safeLimit) || 1,
        currentPage: safePage,
        limit: safeLimit,
      },
    };
  }

  /**
   * Get single Patreon user
   */
  async getPatreonUser(userId) {
    const user = await prisma.patreonUser.findUnique({
      where: { id: parseInt(userId) },
      select: {
        id: true,
        patreon_id: true,
        email: true,
        full_name: true,
        membership_tier: true,
        is_active_patron: true,
        pledge_amount_cents: true,
        last_verified_at: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!user) {
      throw new Error("Patreon user not found");
    }

    return {
      ...user,
      pledge_amount: user.pledge_amount_cents
        ? user.pledge_amount_cents / 100
        : 0,
    };
  }

  /**
   * Revoke user access (for admin)
   */
  async revokeUserAccess(userId) {
    await prisma.patreonUser.update({
      where: { id: parseInt(userId) },
      data: {
        is_active_patron: false,
      },
    });
  }
}

export default new PatreonService();
