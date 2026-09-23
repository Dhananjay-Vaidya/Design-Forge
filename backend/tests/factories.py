from decimal import Decimal

import factory
from factory.django import DjangoModelFactory

from apps.accounts.models import User
from apps.decisions.models import Alternative, AlternativeScore, Criterion, Decision


class UserFactory(DjangoModelFactory):
    class Meta:
        model = User
        django_get_or_create = ["email"]
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    is_active = True

    @factory.post_generation
    def password(self, create, extracted, **kwargs):
        self.set_password(extracted or "TestPassw0rd!23")
        if create:
            self.save()


class DecisionFactory(DjangoModelFactory):
    class Meta:
        model = Decision

    owner = factory.SubFactory(UserFactory)
    title = factory.Sequence(lambda n: f"Decision {n}")
    context = ""
    category = "career"


class AlternativeFactory(DjangoModelFactory):
    class Meta:
        model = Alternative

    decision = factory.SubFactory(DecisionFactory)
    name = factory.Sequence(lambda n: f"Alternative {n}")
    position = factory.Sequence(lambda n: n)


class CriterionFactory(DjangoModelFactory):
    class Meta:
        model = Criterion

    decision = factory.SubFactory(DecisionFactory)
    name = factory.Sequence(lambda n: f"Criterion {n}")
    weight = Decimal("1")
    direction = Criterion.Direction.BENEFIT
    is_active = True


class AlternativeScoreFactory(DjangoModelFactory):
    class Meta:
        model = AlternativeScore

    alternative = factory.SubFactory(AlternativeFactory)
    criterion = factory.SubFactory(CriterionFactory)
    score = Decimal("5")
