import { Module, Global } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventPublisherService } from './event-publisher.service';
import { DOMAIN_EVENT_PUBLISHER } from '../../domain/shared/domain-event';

@Global()
@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [
    EventPublisherService,
    {
      provide: DOMAIN_EVENT_PUBLISHER,
      useExisting: EventPublisherService,
    },
  ],
  exports: [DOMAIN_EVENT_PUBLISHER],
})
export class EventsModule {}
