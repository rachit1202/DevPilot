import { prisma } from '../../db/prisma';
import { ActivityService } from '../activity/activity.service';
import { UpdateBrandInput, UpdateApplicationSettingsInput } from '@devpilot/validation';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../../types/fastify';
import { config } from '../../config/env';

export class SettingsService {
  /**
   * Retrieves current BrandSettings.
   * Ensures the initial CodeCulture record exists if not already present.
   */
  static async getBrandSettings() {
    let brand = await prisma.brandSettings.findFirst({
      where: { brandName: 'CodeCulture' },
    });

    if (!brand) {
      brand = await prisma.brandSettings.findFirst();
    }

    if (!brand) {
      brand = await prisma.brandSettings.create({
        data: {
          brandName: 'CodeCulture',
          tagline: 'Code. Create. Build. Repeat.',
          websiteUrl: 'https://codeculture.dev',
          primaryColor: '#8B5CF6',
          secondaryColor: '#06B6D4',
          tone: 'Modern, developer-friendly, humorous but informative, creative',
          audience: 'Web developers, students, freelancers, AI enthusiasts, tech founders',
          industry: 'Developer Education & Tech Media',
          primaryLanguage: 'en',
          topics: [
            'Coding Memes',
            'Developer Life',
            'AI & Vibe Coding',
            'Web Development Tips',
            'Programming Tutorials',
            'Tech News & Trends',
            'Tools & Resources',
          ],
          avoidTopics: ['Partisan politics', 'Unverified rumors', 'Hate speech'],
          ctaDefaults: 'Follow @CodeCulture for daily web dev insights, vibe coding tips, and tech humor.',
        },
      });
    }

    return brand;
  }

  /**
   * Updates BrandSettings.
   * Enforces OWNER/ADMIN permission, validates inputs, logs changes.
   */
  static async updateBrandSettings(input: UpdateBrandInput, user: AuthUser) {
    if (user.role !== UserRole.OWNER && user.role !== UserRole.ADMIN) {
      throw new Error('FORBIDDEN: Only Owners and Admins have permission to modify brand settings.');
    }

    const currentBrand = await this.getBrandSettings();

    const updated = await prisma.brandSettings.update({
      where: { id: currentBrand.id },
      data: {
        brandName: input.brandName,
        tagline: input.tagline,
        description: input.description,
        websiteUrl: input.websiteUrl,
        logoUrl: input.logoUrl,
        primaryColor: input.primaryColor,
        secondaryColor: input.secondaryColor,
        tone: input.tone,
        audience: input.audience,
        industry: input.industry,
        primaryLanguage: input.primaryLanguage,
        guidelines: input.guidelines,
        topics: input.topics,
        avoidTopics: input.avoidTopics,
        ctaDefaults: input.ctaDefaults,
      },
    });

    await ActivityService.log({
      userId: user.id,
      action: 'BRAND_SETTINGS_UPDATED',
      entityType: 'BRAND_SETTINGS',
      entityId: updated.id,
      metadata: {
        updatedFields: Object.keys(input),
        brandName: updated.brandName,
      },
    });

    return updated;
  }

  /**
   * Retrieves current ApplicationSettings.
   * Ensures default application configuration exists.
   */
  static async getApplicationSettings() {
    let appSettings = await prisma.applicationSettings.findFirst();

    if (!appSettings) {
      appSettings = await prisma.applicationSettings.create({
        data: {
          timezone: config.APP_TIMEZONE || 'Asia/Kolkata',
          defaultLanguage: 'en',
          timeFormat: '12h',
          dateFormat: 'YYYY-MM-DD',
          firstDayOfWeek: 0,
          defaultView: 'month',
        },
      });
    }

    return appSettings;
  }

  /**
   * Updates ApplicationSettings.
   * Enforces OWNER/ADMIN permission, validates timezone, logs changes.
   * INVARIANT: Changing timezone does not mutate stored UTC schedule dates.
   */
  static async updateApplicationSettings(input: UpdateApplicationSettingsInput, user: AuthUser) {
    if (user.role !== UserRole.OWNER && user.role !== UserRole.ADMIN) {
      throw new Error('FORBIDDEN: Only Owners and Admins have permission to modify application settings.');
    }

    const currentSettings = await this.getApplicationSettings();

    const updated = await prisma.applicationSettings.update({
      where: { id: currentSettings.id },
      data: {
        timezone: input.timezone,
        defaultLanguage: input.defaultLanguage,
        timeFormat: input.timeFormat,
        dateFormat: input.dateFormat,
        firstDayOfWeek: input.firstDayOfWeek,
        defaultView: input.defaultView,
      },
    });

    await ActivityService.log({
      userId: user.id,
      action: 'APPLICATION_SETTINGS_UPDATED',
      entityType: 'APPLICATION_SETTINGS',
      entityId: updated.id,
      metadata: {
        updatedFields: Object.keys(input),
        newTimezone: updated.timezone,
      },
    });

    return updated;
  }
}
