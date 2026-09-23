from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import User, UserProfile


@receiver(post_save, sender=User)
def create_profile_for_new_user(sender, instance: User, created: bool, **kwargs):
    """UC-01 postcondition: UserProfile created with defaults (SRS §4)."""
    if created:
        UserProfile.objects.get_or_create(user=instance)
