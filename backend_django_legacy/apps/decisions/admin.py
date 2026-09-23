from django.contrib import admin

from .models import Alternative, AlternativeScore, Criterion, Decision


class AlternativeInline(admin.TabularInline):
    model = Alternative
    extra = 0


class CriterionInline(admin.TabularInline):
    model = Criterion
    extra = 0


@admin.register(Decision)
class DecisionAdmin(admin.ModelAdmin):
    list_display = ["title", "owner", "status", "category", "updated_at"]
    list_filter = ["status", "category"]
    search_fields = ["title", "owner__email"]
    inlines = [AlternativeInline, CriterionInline]


@admin.register(Alternative)
class AlternativeAdmin(admin.ModelAdmin):
    list_display = ["name", "decision", "position"]
    search_fields = ["name", "decision__title"]


@admin.register(Criterion)
class CriterionAdmin(admin.ModelAdmin):
    list_display = ["name", "decision", "weight", "direction", "is_active"]
    list_filter = ["direction", "is_active"]


@admin.register(AlternativeScore)
class AlternativeScoreAdmin(admin.ModelAdmin):
    list_display = ["alternative", "criterion", "score"]
